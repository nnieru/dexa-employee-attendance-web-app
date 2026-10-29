import {
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { EMPTY, defer, lastValueFrom, type Observable } from 'rxjs';
import {
  decideDeliverySettlement,
  type DeliveryOutcome,
  type DeliverySettlement,
} from './delivery-settlement.rules.js';
import { describeError } from './describe-error.js';
import { parseEventMessage, type EventMessage } from './event-message.js';

type DeliveryChannel = Pick<Channel, 'ack' | 'nack' | 'reject'>;

/** One delivery, with the channel that delivered it: settlement must use that channel. */
type Delivery = {
  readonly channel: DeliveryChannel;
  readonly message: Message;
  readonly pattern: string;
};

type SettledDelivery = {
  readonly delivery: Delivery;
  readonly eventId: string;
  readonly outcome: DeliveryOutcome;
};

const UNKNOWN_EVENT_ID = 'unknown';

const logger = new Logger('RmqAckInterceptor');

/**
 * Settles each event delivery once its handler has finished:
 * - the handler resolves: ack.
 * - the body is not an event message, or the handler throws NonRetryableMessageError: nack without requeue,
 *   which dead-letters the message at once. An invalid body never reaches the handler.
 * - any other error: reject with requeue. The broker redelivers the message and dead-letters it after
 *   MAX_DELIVERIES attempts.
 *
 * Create one per consumer queue and register it with connectEventConsumer. Nest runs interceptors around
 * the handler, so this is the one place that acks or nacks. Errors are logged here and not rethrown, so
 * Nest's handler error path never sees them and the observable always completes.
 */
export class RmqAckInterceptor implements NestInterceptor {
  constructor(private readonly queue: string) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const delivery = readDelivery(context);
    if (delivery === undefined) {
      return next.handle();
    }
    const envelope = parseEventMessage(context.switchToRpc().getData<unknown>());
    if (envelope.kind === 'invalid') {
      this.settle({
        delivery,
        eventId: readMessageId(delivery.message),
        outcome: { kind: 'invalid-envelope' },
      });
      return EMPTY;
    }
    return defer(() => this.runHandler(next, delivery, envelope.message));
  }

  private async runHandler(
    next: CallHandler,
    delivery: Delivery,
    event: EventMessage,
  ): Promise<undefined> {
    const outcome = await awaitHandler(next);
    this.settle({ delivery, eventId: event.eventId, outcome });
    return undefined;
  }

  private settle(settled: SettledDelivery): void {
    const settlement = decideDeliverySettlement(settled.outcome);
    try {
      applySettlement(settled.delivery, settlement);
    } catch (error: unknown) {
      // A closed channel cannot settle. The broker then requeues the delivery, so the event is not lost.
      logger.error(
        `Could not ${SETTLEMENT_VERB[settlement]} event ${settled.eventId} (${settled.delivery.pattern}) ` +
          `on ${this.queue}: ${describeError(error)}`,
      );
      return;
    }
    logSettlement(this.queue, settled, settlement);
  }
}

async function awaitHandler(next: CallHandler): Promise<DeliveryOutcome> {
  try {
    await lastValueFrom(next.handle(), { defaultValue: undefined });
    return { kind: 'handled' };
  } catch (error: unknown) {
    return { kind: 'handler-failed', error };
  }
}

const SETTLEMENT_VERB = {
  ack: 'acknowledge',
  requeue: 'requeue',
  'dead-letter': 'dead-letter',
} as const satisfies Record<DeliverySettlement, string>;

function applySettlement(delivery: Delivery, settlement: DeliverySettlement): void {
  const { channel, message } = delivery;
  switch (settlement) {
    case 'ack':
      channel.ack(message);
      return;
    case 'requeue':
      // basic.reject, not basic.nack: RabbitMQ 4.4 counts only a rejected requeue towards the delivery limit.
      channel.reject(message, true);
      return;
    case 'dead-letter':
      // Discards this one delivery without requeue. The queue's dead-letter exchange takes it from there.
      channel.nack(message, false, false);
      return;
  }
}

function logSettlement(
  queue: string,
  settled: SettledDelivery,
  settlement: DeliverySettlement,
): void {
  if (settlement === 'ack') {
    return;
  }
  const { eventId, delivery, outcome } = settled;
  const reason = describeFailure(outcome);
  if (settlement === 'requeue') {
    logger.warn(`Event ${eventId} (${delivery.pattern}) failed on ${queue}; requeued: ${reason}`);
    return;
  }
  logger.error(
    `Event ${eventId} (${delivery.pattern}) on ${queue} is dead-lettered without redelivery: ${reason}`,
  );
}

function describeFailure(outcome: DeliveryOutcome): string {
  switch (outcome.kind) {
    case 'handled':
      return 'the handler resolved';
    case 'invalid-envelope':
      return 'the body is not an event message';
    case 'handler-failed':
      return describeError(outcome.error);
  }
}

function readDelivery(context: ExecutionContext): Delivery | undefined {
  if (context.getType() !== 'rpc') {
    return undefined;
  }
  const rmqContext = context.switchToRpc().getContext<unknown>();
  if (!(rmqContext instanceof RmqContext)) {
    return undefined;
  }
  const channel = rmqContext.getChannelRef();
  const message = rmqContext.getMessage();
  if (!isDeliveryChannel(channel) || !isMessage(message)) {
    throw new Error('The RMQ context does not carry the channel and message of its delivery');
  }
  return { channel, message, pattern: rmqContext.getPattern() };
}

// Nest types the channel and message loosely. These checks cover what the interceptor reads.
function isDeliveryChannel(value: unknown): value is DeliveryChannel {
  return (
    isRecord(value) &&
    typeof value.ack === 'function' &&
    typeof value.nack === 'function' &&
    typeof value.reject === 'function'
  );
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    Buffer.isBuffer(value.content) &&
    isRecord(value.fields) &&
    isRecord(value.properties)
  );
}

function readMessageId(message: Message): string {
  const { messageId } = message.properties;
  return typeof messageId === 'string' ? messageId : UNKNOWN_EVENT_ID;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
