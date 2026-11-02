import { Logger } from '@nestjs/common';
import {
  ServerRMQ,
  type MessageHandler,
  type RmqContext,
  type RmqOptions,
} from '@nestjs/microservices';
import type { Channel } from 'amqplib';
import { QUORUM_QUEUE_ARGUMENTS } from '@dexa/messaging';
import { readFailureCode } from './archive-failure.rules.js';
import type { DeadLetterConsumerStatus } from './dead-letter-consumer-status.js';
import type { DeadLetterParkingPublisher } from './dead-letter-parking.publisher.js';
import {
  readRmqDelivery,
  type DeliveryOutcome,
  type RmqDelivery,
} from './dead-letter-delivery.handler.js';

type RmqConsumerOptions = NonNullable<RmqOptions['options']>;

export type DeadLetterServerDependencies = {
  readonly handleDelivery: (delivery: RmqDelivery) => Promise<DeliveryOutcome>;
  readonly parking: DeadLetterParkingPublisher;
  readonly parkedQueue: string;
  readonly pauseMs: number;
  readonly status: DeadLetterConsumerStatus;
};

const logger = new Logger('DeadLetterArchiver');

/**
 * An RMQ consumer of a dead-letter queue. Nest's RMQ server looks handlers up by the message's pattern. A
 * dead-lettered body that is not a Nest envelope has no pattern, so the server would nack it without requeue, and
 * the DLQ has no dead-letter exchange to receive it. This server sends every delivery to one handler instead.
 *
 * It also owns the consumer's lifecycle. After a transient failure it cancels the consumer for pauseMs, then
 * consumes again, and it reports the pause through DeadLetterConsumerStatus. It declares the parking queue on
 * every (re)connect, next to the DLQ consumer.
 */
export class DeadLetterRmqServer extends ServerRMQ {
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    options: RmqConsumerOptions,
    private readonly dependencies: DeadLetterServerDependencies,
  ) {
    super(options);
  }

  getHandlerByPattern(): MessageHandler {
    return this.deliveryHandler;
  }

  // Declared on every (re)connect, so a parking publish always finds its queue. A successful setup means the
  // consumer is running again, so the pause ends here, whether it was a resume or a reconnect.
  async setupChannel(channel: Channel, callback: () => void): Promise<void> {
    await channel.assertQueue(this.dependencies.parkedQueue, {
      durable: true,
      arguments: { ...QUORUM_QUEUE_ARGUMENTS },
    });
    await super.setupChannel(channel, callback);
    this.dependencies.status.markResumed();
  }

  async close(): Promise<void> {
    clearTimeout(this.resumeTimer);
    this.resumeTimer = undefined;
    this.dependencies.status.markResumed();
    try {
      await super.close();
    } finally {
      await this.dependencies.parking.close();
    }
  }

  // An arrow property, so Nest can call it unbound.
  private readonly deliveryHandler: MessageHandler = async (
    _data: unknown,
    context?: RmqContext,
  ): Promise<undefined> => {
    const delivery = readRmqDelivery(context);
    const outcome = await this.dependencies.handleDelivery(delivery);
    if (outcome === 'requeued') {
      this.pauseConsumer(delivery);
    }
    return undefined;
  };

  // Cancelling stops new deliveries. Deliveries already in flight still settle on their own channel.
  private pauseConsumer(delivery: RmqDelivery): void {
    if (this.dependencies.status.isPaused) {
      return;
    }
    this.dependencies.status.markPaused();
    const { channel, consumerTag } = delivery;
    channel.cancel(consumerTag).catch((error: unknown) => {
      logger.error(`Could not cancel the dead-letter consumer: ${describeError(error)}`);
    });
    this.scheduleResume(channel);
  }

  private scheduleResume(channel: Channel): void {
    this.resumeTimer = setTimeout(() => {
      void this.resumeConsumer(channel);
    }, this.dependencies.pauseMs);
  }

  // Consumes again through the same setup Nest runs on connect. A reconnect may already have set the consumer up, so
  // a resume that finds the consumer running does nothing. A failed resume is scheduled again.
  private async resumeConsumer(channel: Channel): Promise<void> {
    this.resumeTimer = undefined;
    if (!this.dependencies.status.isPaused) {
      return;
    }
    try {
      await this.setupChannel(channel, () => undefined);
      logger.log('Resumed the dead-letter consumer');
    } catch (error: unknown) {
      // A closed channel means the connection dropped. amqp-connection-manager sets the consumer up again on
      // reconnect, and the next scheduled resume then finds it running.
      logger.error(`Could not resume the dead-letter consumer: ${describeError(error)}`);
      this.scheduleResume(channel);
    }
  }
}

// Logs carry the code only, never the error message, which can echo query parameters.
function describeError(error: unknown): string {
  const code = readFailureCode(error);
  if (code !== undefined) {
    return code;
  }
  return error instanceof Error ? error.name : 'unknown error';
}
