import type { INestApplication } from '@nestjs/common';
import { createDeadLetterConsumerOptions, type EventQueueSettings } from '@dexa/messaging';
import type { DeadLetterArchiveService } from './dead-letter-archive.service.js';
import { createDeadLetterHandler } from './dead-letter-delivery.handler.js';
import { DeadLetterRmqServer } from './dead-letter-rmq-server.js';

/**
 * Adds the consumer of a queue's dead-letter queue to a hybrid Nest app. The service must start it with
 * `app.startAllMicroservices()`. The dead-letter queue is declared by this consumer itself, so it needs no
 * separate setup. The ack interceptor is deliberately not applied (see createDeadLetterConsumerOptions).
 */
export function connectDeadLetterConsumer(
  app: INestApplication,
  settings: EventQueueSettings,
  archive: DeadLetterArchiveService,
): void {
  const { options } = createDeadLetterConsumerOptions(settings);
  if (options === undefined) {
    // createDeadLetterConsumerOptions always sets its options. The check only narrows the optional type.
    throw new Error('createDeadLetterConsumerOptions returned no RMQ options');
  }
  const handler = createDeadLetterHandler(archive, settings.queue);
  app.connectMicroservice({ strategy: new DeadLetterRmqServer(options, handler) });
}
