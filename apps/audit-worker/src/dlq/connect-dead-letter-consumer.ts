import type { INestApplication } from '@nestjs/common';
import {
  createDeadLetterConsumerOptions,
  parkedQueueName,
  type EventQueueSettings,
} from '@dexa/messaging';
import { sleep } from './archive-with-retry.js';
import { DEFAULT_DEAD_LETTER_TIMING, type DeadLetterTiming } from './dead-letter-policy.js';
import { createDeadLetterHandler } from './dead-letter-delivery.handler.js';
import type { DeadLetterArchiveService } from './dead-letter-archive.service.js';
import type { DeadLetterConsumerStatus } from './dead-letter-consumer-status.js';
import { DeadLetterParkingPublisher } from './dead-letter-parking.publisher.js';
import { DeadLetterRmqServer } from './dead-letter-rmq-server.js';

export type DeadLetterConsumerDependencies = {
  readonly settings: EventQueueSettings;
  readonly archive: DeadLetterArchiveService;
  readonly status: DeadLetterConsumerStatus;
  readonly timing?: DeadLetterTiming;
};

/**
 * Adds the consumer of a queue's dead-letter queue to a hybrid Nest app. The service must start it with
 * `app.startAllMicroservices()`. The dead-letter queue and the parking queue are declared by this consumer itself,
 * so they need no separate setup. The ack interceptor is deliberately not applied (see createDeadLetterConsumerOptions).
 */
export function connectDeadLetterConsumer(
  app: INestApplication,
  dependencies: DeadLetterConsumerDependencies,
): void {
  const { settings, archive, status, timing = DEFAULT_DEAD_LETTER_TIMING } = dependencies;
  const { options } = createDeadLetterConsumerOptions(settings);
  if (options === undefined) {
    // createDeadLetterConsumerOptions always sets its options. The check only narrows the optional type.
    throw new Error('createDeadLetterConsumerOptions returned no RMQ options');
  }
  const parkedQueue = parkedQueueName(settings.queue);
  const parking = new DeadLetterParkingPublisher(settings.url, parkedQueue);
  const handleDelivery = createDeadLetterHandler({
    sourceQueue: settings.queue,
    archive: (delivery) => archive.archive(settings.queue, delivery),
    park: (message) => parking.park(message),
    retry: { delaysMs: timing.archiveRetryDelaysMs, sleep },
  });
  app.connectMicroservice({
    strategy: new DeadLetterRmqServer(options, {
      handleDelivery,
      parking,
      parkedQueue,
      pauseMs: timing.consumerPauseMs,
      status,
    }),
  });
}
