export type { EventMessage } from './event-message.js';
export { EVENT_PUBLISHER, type IEventPublisher } from './event-publisher.interface.js';
export { NonRetryableMessageError } from './event-delivery.errors.js';
export { MessagingModule, type MessagingModuleOptions } from './messaging.module.js';
export { connectEventConsumer } from './connect-event-consumer.js';
export {
  createDeadLetterConsumerOptions,
  type EventQueueSettings,
} from './event-consumer.options.js';
export {
  EVENTS_EXCHANGE,
  MAX_DELIVERIES,
  QUORUM_QUEUE_ARGUMENTS,
  deadLetterQueueName,
  parkedQueueName,
} from './event-topology.js';
export { RmqAckInterceptor } from './rmq-ack.interceptor.js';
export { OutboxModule } from './outbox/outbox.module.js';
export type { OutboxModuleOptions } from './outbox/outbox-settings.js';
export { outboxEvents } from './outbox/outbox-events.table.js';
export {
  OUTBOX_WRITER,
  type IOutboxWriter,
  type OutboxTransaction,
} from './outbox/outbox-writer.interface.js';
