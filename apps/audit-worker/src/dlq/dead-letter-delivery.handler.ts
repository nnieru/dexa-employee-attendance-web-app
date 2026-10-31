import { Logger } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import { archiveWithRetry, type RetryPolicy } from './archive-with-retry.js';
import { classifyArchiveFailure, readFailureCode } from './archive-failure.rules.js';
import type { DeadLetterDelivery } from './dead-letter-archive.rules.js';

export type RmqDelivery = {
  readonly channel: Channel;
  readonly message: Message;
  /** The consumer that delivered the message, so the server can cancel exactly that consumer. */
  readonly consumerTag: string;
};

/**
 * What became of one delivery. `requeued` means the message is back in the DLQ after a transient failure, and the
 * server pauses the consumer before it takes more work.
 */
export type DeliveryOutcome = 'archived' | 'parked' | 'requeued';

export type DeadLetterHandlerPorts = {
  readonly sourceQueue: string;
  /** Resolves once the failure row has committed. */
  readonly archive: (delivery: DeadLetterDelivery) => Promise<void>;
  /** Resolves once the broker has confirmed the parking publish. */
  readonly park: (message: Message) => Promise<void>;
  readonly retry: RetryPolicy;
};

/** How one delivery is acknowledged or requeued. Bound to the delivering channel and message by the handler. */
export type DeliverySettlement = {
  readonly ack: () => void;
  readonly requeue: () => void;
};

export type DeliverySettlementInput = {
  readonly sourceQueue: string;
  /** The AMQP message ID for logs, or a placeholder. Never a body or a header. */
  readonly messageLabel: string;
  readonly archive: () => Promise<void>;
  readonly park: () => Promise<void>;
  readonly settlement: DeliverySettlement;
  readonly retry: RetryPolicy;
};

const logger = new Logger('DeadLetterArchiver');

/**
 * Creates the catch-all handler for a queue's dead-letter queue. The handler settles each delivery as described in
 * settleDeadLetterDelivery.
 */
export function createDeadLetterHandler(
  ports: DeadLetterHandlerPorts,
): (delivery: RmqDelivery) => Promise<DeliveryOutcome> {
  return ({ channel, message }) =>
    settleDeadLetterDelivery({
      sourceQueue: ports.sourceQueue,
      messageLabel: describeMessageId(message),
      archive: () => ports.archive(toArchiveDelivery(message)),
      park: () => ports.park(message),
      settlement: {
        ack: () => channel.ack(message),
        requeue: () => channel.nack(message, false, true),
      },
      retry: ports.retry,
    });
}

/**
 * Settles one dead-lettered delivery (DATABASE §6.2, D-46):
 * - archived: ack after the commit.
 * - transient failure after the retries: requeue, so the message stays in the DLQ.
 * - permanent failure after the retries: park the unchanged message, then ack. If the parking publish fails, the
 *   delivery is treated as transient, so nothing is lost.
 * Logs carry the queue, the message label and the failure code only.
 */
export async function settleDeadLetterDelivery(
  input: DeliverySettlementInput,
): Promise<DeliveryOutcome> {
  const outcome = await archiveWithRetry(input.archive, input.retry);
  if (outcome.kind === 'archived') {
    input.settlement.ack();
    return 'archived';
  }

  const code = describeCode(outcome.error);
  if (classifyArchiveFailure(outcome.error) === 'permanent') {
    const parked = await tryPark(input, code);
    if (parked) {
      input.settlement.ack();
      logger.error(
        `Parked dead-letter message ${input.messageLabel} from ${input.sourceQueue} (${code})`,
      );
      return 'parked';
    }
  }
  input.settlement.requeue();
  logger.warn(
    `Archive of dead-letter message ${input.messageLabel} from ${input.sourceQueue} failed (${code}); ` +
      'requeued and pausing the archive consumer',
  );
  return 'requeued';
}

async function tryPark(input: DeliverySettlementInput, archiveCode: string): Promise<boolean> {
  try {
    await input.park();
    return true;
  } catch (parkError: unknown) {
    logger.error(
      `Could not park dead-letter message ${input.messageLabel} from ${input.sourceQueue} ` +
        `after archive failed (${archiveCode}); parking failed with ${describeCode(parkError)}`,
    );
    return false;
  }
}

function toArchiveDelivery(message: Message): DeadLetterDelivery {
  return {
    content: message.content,
    messageId: message.properties.messageId,
    headers: message.properties.headers,
  };
}

function describeMessageId(message: Message): string {
  const { messageId } = message.properties;
  return typeof messageId === 'string' ? messageId : 'without-message-id';
}

function describeCode(error: unknown): string {
  const code = readFailureCode(error);
  if (code !== undefined) {
    return code;
  }
  return error instanceof Error ? error.name : 'unknown error';
}

/** Reads the channel and message of a delivery from Nest's RMQ context. */
export function readRmqDelivery(context: RmqContext | undefined): RmqDelivery {
  if (context === undefined) {
    throw new Error('The dead-letter delivery has no RMQ context');
  }
  const channel: unknown = context.getChannelRef();
  const message: unknown = context.getMessage();
  if (!isDeliveryChannel(channel) || !isMessage(message)) {
    throw new Error('The RMQ context does not carry the channel and message of its delivery');
  }
  const { consumerTag } = message.fields;
  if (typeof consumerTag !== 'string') {
    throw new Error('The RMQ delivery does not name its consumer');
  }
  return { channel, message, consumerTag };
}

// Nest types the channel and message loosely, so the members this handler uses are checked at runtime.
function isDeliveryChannel(value: unknown): value is Channel {
  return (
    isRecord(value) &&
    typeof value.ack === 'function' &&
    typeof value.nack === 'function' &&
    typeof value.cancel === 'function'
  );
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    Buffer.isBuffer(value.content) &&
    isRecord(value.properties) &&
    isRecord(value.fields)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
