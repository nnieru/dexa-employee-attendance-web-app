import 'reflect-metadata';
import { configureApp } from '@dexa/common';
import { connectEventConsumer } from '@dexa/messaging';
import { NestFactory } from '@nestjs/core';
import { createAppModule } from './app.module.js';
import { loadNotificationServiceConfig } from './config/load-notification-service-config.js';
import { HR_NOTIFICATIONS_QUEUE } from './ingestion/hr-notifications-queue.constants.js';

const DEFAULT_PORT = 3004;

// A hybrid app: HTTP serves the health route, and the RMQ consumer runs beside it. The consumer is connected before
// listen, so the event handlers are registered with the ack interceptor, and started after listen, which runs the
// migrations.
const config = loadNotificationServiceConfig();
const app = await NestFactory.create(createAppModule(config));
configureApp(app, config);
await connectEventConsumer(app, { url: config.RABBITMQ_URL, queue: HR_NOTIFICATIONS_QUEUE });
await app.listen(config.PORT ?? DEFAULT_PORT, config.HOST);
await app.startAllMicroservices();
