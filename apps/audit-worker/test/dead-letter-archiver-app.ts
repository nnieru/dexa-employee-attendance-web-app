import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK, configureApp, parseConfig, type IClock } from '@dexa/common';
import { createAppModule } from '../src/app.module.js';
import { connectDeadLetterConsumer } from '../src/dlq/connect-dead-letter-consumer.js';
import type { DeadLetterTiming } from '../src/dlq/dead-letter-policy.js';
import {
  DEAD_LETTER_ARCHIVE_WRITER,
  type IDeadLetterArchiveWriter,
} from '../src/dlq/dead-letter-archive.interface.js';
import { DeadLetterArchiveService } from '../src/dlq/dead-letter-archive.service.js';
import { DeadLetterConsumerStatus } from '../src/dlq/dead-letter-consumer-status.js';
import type { DeadLetterArchiveRecord } from '../src/dlq/dead-letter-archive.rules.js';
import { AuditWorkerConfigSchema } from '../src/config/audit-worker-config.schema.js';
import { auditWorkerEnvironment } from './audit-worker-environment.js';

// The archive time used when a message carries no x-death entry for its source queue.
export const ARCHIVED_AT = new Date('2026-10-30T02:10:00.000Z');

/** A driver-shaped error with a SQLSTATE or network code, as node-postgres and Node raise them. */
export function failureWithCode(code: string): Error {
  return Object.assign(new Error('simulated driver failure'), { code });
}

/**
 * Wraps a writer and fails its first `failuresBeforeSuccess` calls with the error `failure` builds. Counts attempts
 * and completed upserts, so a test can wait for the commit it expects.
 */
export class ScriptedDeadLetterArchiveWriter implements IDeadLetterArchiveWriter {
  attempts = 0;
  successes = 0;
  private remainingFailures: number;

  constructor(
    private readonly delegate: IDeadLetterArchiveWriter | undefined,
    failuresBeforeSuccess: number,
    private readonly failure: () => Error = () => failureWithCode('08006'),
  ) {
    this.remainingFailures = failuresBeforeSuccess;
  }

  async upsertFailure(record: DeadLetterArchiveRecord): Promise<void> {
    this.attempts += 1;
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw this.failure();
    }
    await this.delegate?.upsertFailure(record);
    this.successes += 1;
  }
}

export type DeadLetterArchiverAppOptions = {
  readonly databaseUrl: string;
  readonly rabbitMqUrl: string;
  readonly queue: string;
  readonly archiveWriter?: IDeadLetterArchiveWriter;
  /** Short retry and pause timings, so a test does not wait for the production 15 s and 60 s. */
  readonly timing?: DeadLetterTiming;
};

const fixedClock: IClock = { now: () => ARCHIVED_AT };

/**
 * Starts the audit worker with only its dead-letter consumer connected, as main.ts connects it. Migrations run at
 * init, so the database must be reachable. The queue name is passed in so each test archives a queue of its own.
 */
export async function startDeadLetterArchiverApp(
  options: DeadLetterArchiverAppOptions,
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
  if (options.archiveWriter !== undefined) {
    moduleBuilder = moduleBuilder
      .overrideProvider(DEAD_LETTER_ARCHIVE_WRITER)
      .useValue(options.archiveWriter);
  }
  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  // The same HTTP setup as main.ts, so the health route answers under the API prefix.
  configureApp(app, config);
  connectDeadLetterConsumer(app, {
    settings: { url: options.rabbitMqUrl, queue: options.queue },
    archive: app.get(DeadLetterArchiveService),
    status: app.get(DeadLetterConsumerStatus),
    timing: options.timing,
  });
  await app.init();
  await app.startAllMicroservices();
  return app;
}
