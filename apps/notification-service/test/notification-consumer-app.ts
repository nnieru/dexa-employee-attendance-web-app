import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK, configureApp, parseConfig, type IClock } from '@dexa/common';
import { connectEventConsumer } from '@dexa/messaging';
import { createAppModule } from '../src/app.module.js';
import { NotificationServiceConfigSchema } from '../src/config/notification-service-config.schema.js';
import { AUTH_CLIENT, type IAuthClient } from '../src/ingestion/auth-client.interface.js';
import {
  EMPLOYEE_CLIENT,
  type IEmployeeClient,
} from '../src/ingestion/employee-client.interface.js';
import {
  NOTIFICATION_PUBLISHER,
  type INotificationPublisher,
} from '../src/ingestion/notification-publisher.interface.js';
import {
  NOTIFICATION_WRITER,
  type INotificationWriter,
} from '../src/ingestion/notification-writer.interface.js';
import { NOTIFICATION_STREAM_HEARTBEAT } from '../src/stream/notification-stream.constants.js';
import { notificationServiceEnvironment } from './notification-service-environment.js';

// The created_at value every inbox row gets in these specs, from the injected clock.
export const CREATED_AT = new Date('2026-10-30T02:05:01.000Z');

export type NotificationConsumerAppOptions = {
  readonly databaseUrl: string;
  readonly rabbitMqUrl: string;
  readonly queue: string;
  readonly authClient: IAuthClient;
  readonly employeeClient: IEmployeeClient;
  readonly notificationWriter?: INotificationWriter;
  // Replaces the live push, so a test can count pushes without a stream subscriber.
  readonly notificationPublisher?: INotificationPublisher;
  // The stream specs shorten the heartbeat, so a test can observe heartbeats within a fraction of a second.
  readonly heartbeatMilliseconds?: number;
};

const fixedClock: IClock = { now: () => CREATED_AT };

/**
 * Starts the notification service the way main.ts does: an HTTP listener on an ephemeral loopback port, and the
 * consumer on its own queue. Migrations run at init, so the database must be reachable. The queue name is passed in
 * so each test consumes a queue of its own. The Auth and Employee clients are fakes, so no test reaches another service.
 */
export async function startNotificationConsumerApp(
  options: NotificationConsumerAppOptions,
): Promise<INestApplication> {
  const config = parseConfig(
    NotificationServiceConfigSchema,
    notificationServiceEnvironment({
      NOTIFICATION_DATABASE_URL: options.databaseUrl,
      RABBITMQ_URL: options.rabbitMqUrl,
    }),
  );
  let moduleBuilder = Test.createTestingModule({ imports: [createAppModule(config)] })
    .overrideProvider(CLOCK)
    .useValue(fixedClock)
    .overrideProvider(AUTH_CLIENT)
    .useValue(options.authClient)
    .overrideProvider(EMPLOYEE_CLIENT)
    .useValue(options.employeeClient);
  if (options.notificationWriter !== undefined) {
    moduleBuilder = moduleBuilder
      .overrideProvider(NOTIFICATION_WRITER)
      .useValue(options.notificationWriter);
  }
  if (options.notificationPublisher !== undefined) {
    moduleBuilder = moduleBuilder
      .overrideProvider(NOTIFICATION_PUBLISHER)
      .useValue(options.notificationPublisher);
  }
  if (options.heartbeatMilliseconds !== undefined) {
    moduleBuilder = moduleBuilder
      .overrideProvider(NOTIFICATION_STREAM_HEARTBEAT)
      .useValue(options.heartbeatMilliseconds);
  }
  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { CORS_ORIGINS: [] });
  await connectEventConsumer(app, { url: options.rabbitMqUrl, queue: options.queue });
  await app.init();
  await app.listen(0, '127.0.0.1');
  await app.startAllMicroservices();
  return app;
}
