import type { INestApplication } from '@nestjs/common';
import { declareDeadLetterQueue } from './dead-letter-queue.js';
import { createEventConsumerOptions, type EventQueueSettings } from './event-consumer.options.js';
import { RmqAckInterceptor } from './rmq-ack.interceptor.js';

/**
 * Adds an event queue consumer to a hybrid Nest app. The service must start it with
 * `app.startAllMicroservices()`.
 *
 * The dead-letter queue is declared first, because RabbitMQ discards a dead-lettered message whose target
 * queue is missing. The microservice's listeners are deferred because Nest reads the global interceptors when
 * it registers a microservice's handlers, so the ack interceptor must be registered before that happens.
 */
export async function connectEventConsumer(
  app: INestApplication,
  settings: EventQueueSettings,
): Promise<void> {
  await declareDeadLetterQueue(settings);
  const microservice = app.connectMicroservice(createEventConsumerOptions(settings), {
    deferInitialization: true,
  });
  microservice.useGlobalInterceptors(new RmqAckInterceptor(settings.queue));
}
