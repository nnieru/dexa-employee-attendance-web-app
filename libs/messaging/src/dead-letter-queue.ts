import { connect } from 'amqplib';
import type { EventQueueSettings } from './event-consumer.options.js';
import { QUORUM_QUEUE_ARGUMENTS, deadLetterQueueName } from './event-topology.js';

// Bounds the connection so a stalled broker fails startup instead of hanging it.
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Declares a queue's dead-letter queue with the arguments the consumer uses. RabbitMQ discards a
 * dead-lettered message when its target queue does not exist, so this runs before the consumer
 * subscribes. Declaring an existing queue with the same arguments changes nothing.
 */
export async function declareDeadLetterQueue(settings: EventQueueSettings): Promise<void> {
  const deadLetterQueue = deadLetterQueueName(settings.queue);
  try {
    await assertDeadLetterQueue(settings.url, deadLetterQueue);
  } catch (error: unknown) {
    throw new Error(`Could not declare dead-letter queue ${deadLetterQueue}`, { cause: error });
  }
}

async function assertDeadLetterQueue(url: string, queue: string): Promise<void> {
  const connection = await connect(url, { timeout: CONNECT_TIMEOUT_MS });
  try {
    const channel = await connection.createChannel();
    await channel.assertQueue(queue, { durable: true, arguments: { ...QUORUM_QUEUE_ARGUMENTS } });
    await channel.close();
  } finally {
    await connection.close();
  }
}
