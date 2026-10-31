import 'reflect-metadata';
import { configureApp } from '@dexa/common';
import { connectEventConsumer } from '@dexa/messaging';
import { NestFactory } from '@nestjs/core';
import { AUDIT_PROFILE_CHANGES_QUEUE } from './audit/audit-queue.constants.js';
import { createAppModule } from './app.module.js';
import { connectDeadLetterConsumer } from './dlq/connect-dead-letter-consumer.js';
import { DeadLetterArchiveService } from './dlq/dead-letter-archive.service.js';
import { loadAuditWorkerConfig } from './config/load-audit-worker-config.js';

const DEFAULT_PORT = 3005;

// A hybrid app: HTTP serves the health route, and the RMQ consumers run beside it. The consumers are connected
// before listen, so the event handlers are registered with the ack interceptor, and started after listen, which runs
// the migrations. The dead-letter consumer archives failed deliveries into dlq_messages.
const config = loadAuditWorkerConfig();
const app = await NestFactory.create(createAppModule(config));
configureApp(app, config);
await connectEventConsumer(app, { url: config.RABBITMQ_URL, queue: AUDIT_PROFILE_CHANGES_QUEUE });
connectDeadLetterConsumer(
  app,
  { url: config.RABBITMQ_URL, queue: AUDIT_PROFILE_CHANGES_QUEUE },
  app.get(DeadLetterArchiveService),
);
await app.listen(config.PORT ?? DEFAULT_PORT, config.HOST);
await app.startAllMicroservices();
