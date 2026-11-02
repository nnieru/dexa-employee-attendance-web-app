import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { ne } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { dlqMessages } from '../infrastructure/db/schema.js';
import type { DeadLetterArchiveRecord } from './dead-letter-archive.rules.js';
import type { IDeadLetterArchiveWriter } from './dead-letter-archive.interface.js';

@Injectable()
export class DeadLetterArchiveRepository implements IDeadLetterArchiveWriter {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // A redelivery of the same message updates the existing row instead of adding one. The first
  // failure time is kept, and a replay that fails again returns the row to PENDING (step 7).
  // A RESOLVED row is left alone, so a late duplicate of an old failure cannot reopen a replayed message.
  async upsertFailure(record: DeadLetterArchiveRecord): Promise<void> {
    await this.database.db
      .insert(dlqMessages)
      .values({
        messageId: record.messageId,
        eventId: record.eventId,
        sourceQueue: record.sourceQueue,
        payload: record.payload,
        headers: record.headers,
        attemptCount: record.attemptCount,
        lastError: record.lastError,
        status: 'PENDING',
        firstFailedAt: record.firstFailedAt,
        lastFailedAt: record.lastFailedAt,
      })
      .onConflictDoUpdate({
        target: [dlqMessages.sourceQueue, dlqMessages.messageId],
        set: {
          eventId: record.eventId,
          payload: record.payload,
          headers: record.headers,
          attemptCount: record.attemptCount,
          lastError: record.lastError,
          status: 'PENDING',
          lastFailedAt: record.lastFailedAt,
          resolvedAt: null,
        },
        setWhere: ne(dlqMessages.status, 'RESOLVED'),
      });
  }
}
