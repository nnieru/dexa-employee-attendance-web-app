export type { EventMessage } from './event-message.js';
export { EVENT_PUBLISHER, type IEventPublisher } from './event-publisher.interface.js';
export { NonRetryableMessageError } from './event-delivery.errors.js';
export { MessagingModule, type MessagingModuleOptions } from './messaging.module.js';
export { connectEventConsumer } from './connect-event-consumer.js';
export {
  createDeadLetterConsumerOptions,
  type EventQueueSettings,
} from './event-consumer.options.js';
export { RmqAckInterceptor } from './rmq-ack.interceptor.js';
