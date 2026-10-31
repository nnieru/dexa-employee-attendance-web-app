import { Logger } from '@nestjs/common';
import { RmqContext, type MessageHandler } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';
import type { DeadLetterArchiveService } from './dead-letter-archive.service.js';

type DeliverySettlementChannel = Pick<Channel, 'ack' | 'nack'>;

type Delivery = {
  readonly channel: DeliverySettlementChannel;
  readonly message: Message;
};

const logger = new Logger('DeadLetterArchiver');

/**
 * The catch-all handler for a queue's dead-letter queue. It archives the delivery and acknowledges it only after the
 * database write commits. When the write fails, it nacks with requeue, so the message stays in the DLQ and RabbitMQ
 * redelivers it (DATABASE §6.2 step 4). The DLQ has no delivery limit, so the requeue is not counted.
 */
export function createDeadLetterHandler(
  archive: DeadLetterArchiveService,
  sourceQueue: string,
): MessageHandler {
  return async (_data: unknown, context?: RmqContext): Promise<void> => {
    const delivery = readDelivery(context);
    await archiveAndSettle(archive, sourceQueue, delivery);
  };
}

async function archiveAndSettle(
  archive: DeadLetterArchiveService,
  sourceQueue: string,
  delivery: Delivery,
): Promise<void> {
  const { channel, message } = delivery;
  try {
    await archive.archive(sourceQueue, {
      content: message.content,
      messageId: message.properties.messageId,
      headers: message.properties.headers,
    });
  } catch (error: unknown) {
    // The DB error text can echo the statement's parameters, which include the body, so only its code is logged.
    logger.error(
      `Could not archive a dead-letter message from ${sourceQueue}; it stays in the dead-letter queue. ` +
        `Cause: ${describeFailureCode(error)}`,
    );
    channel.nack(message, false, true);
    return;
  }
  channel.ack(message);
}

function readDelivery(context: RmqContext | undefined): Delivery {
  if (context === undefined) {
    throw new Error('The dead-letter delivery has no RMQ context');
  }
  const channel: unknown = context.getChannelRef();
  const message: unknown = context.getMessage();
  if (!isDeliverySettlementChannel(channel) || !isMessage(message)) {
    throw new Error('The RMQ context does not carry the channel and message of its delivery');
  }
  return { channel, message };
}

// Nest types the channel and message loosely, so the members this handler uses are checked at runtime.
function isDeliverySettlementChannel(value: unknown): value is DeliverySettlementChannel {
  return isRecord(value) && typeof value.ack === 'function' && typeof value.nack === 'function';
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    Buffer.isBuffer(value.content) &&
    isRecord(value.properties) &&
    isRecord(value.fields)
  );
}

function describeFailureCode(error: unknown): string {
  const code = findErrorCode(error);
  if (code !== undefined) {
    return code;
  }
  return error instanceof Error ? error.name : 'unknown error';
}

function findErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return findErrorCode(error.cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
