import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK, parseConfig, type IClock } from '@dexa/common';
import { connectEventConsumer } from '@dexa/messaging';
import { createAppModule } from '../src/app.module.js';
import type { AuditLogRecord } from '../src/audit/audit-event.rules.js';
import { AUDIT_LOG_WRITER, type IAuditLogWriter } from '../src/audit/audit-log-writer.interface.js';
import { AuditWorkerConfigSchema } from '../src/config/audit-worker-config.schema.js';
import { auditWorkerEnvironment } from './audit-worker-environment.js';

// The processed_at value every audit row gets in these specs, from the injected clock.
export const PROCESSED_AT = new Date('2026-10-30T02:05:01.000Z');

/**
 * Wraps a writer and fails its first `failuresBeforeSuccess` calls, which stands in for a database that is
 * unavailable for those attempts. Counts completed inserts, so a test can wait for the commit it expects.
 */
export class ScriptedAuditLogWriter implements IAuditLogWriter {
  attempts = 0;
  successes = 0;
  private remainingFailures: number;

  constructor(
    private readonly delegate: IAuditLogWriter,
    failuresBeforeSuccess: number,
  ) {
    this.remainingFailures = failuresBeforeSuccess;
  }

  async insertIfAbsent(record: AuditLogRecord): Promise<void> {
    this.attempts += 1;
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw new Error('connection terminated unexpectedly');
    }
    await this.delegate.insertIfAbsent(record);
    this.successes += 1;
  }
}

export type AuditConsumerAppOptions = {
  readonly databaseUrl: string;
  readonly rabbitMqUrl: string;
  readonly queue: string;
  readonly auditLogWriter?: IAuditLogWriter;
};

const fixedClock: IClock = { now: () => PROCESSED_AT };

/**
 * Starts the audit worker as a hybrid app on its own queue, the way main.ts does. Migrations run at init, so the
 * database must be reachable. The queue name is passed in so each test consumes a queue of its own.
 */
export async function startAuditConsumerApp(
  options: AuditConsumerAppOptions,
): Promise<INestApplication> {
  const config = parseConfig(
    AuditWorkerConfigSchema,
    auditWorkerEnvironment({
      AUDIT_DATABASE_URL: options.databaseUrl,
      RABBITMQ_URL: options.rabbitMqUrl,
    }),
  );
  let moduleBuilder = Test.createTestingModule({ imports: [createAppModule(config)] })
    .overrideProvider(CLOCK)
    .useValue(fixedClock);
  if (options.auditLogWriter !== undefined) {
    moduleBuilder = moduleBuilder
      .overrideProvider(AUDIT_LOG_WRITER)
      .useValue(options.auditLogWriter);
  }
  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await connectEventConsumer(app, { url: options.rabbitMqUrl, queue: options.queue });
  await app.init();
  await app.startAllMicroservices();
  return app;
}
