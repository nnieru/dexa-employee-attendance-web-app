import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { auditLogs } from '../infrastructure/db/schema.js';
import type { AuditLogRecord } from './audit-event.rules.js';
import type { IAuditLogWriter } from './audit-log-writer.interface.js';

@Injectable()
export class AuditLogRepository implements IAuditLogWriter {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // event_id is the primary key. A redelivered event hits the conflict and inserts nothing, so the consumer
  // acknowledges it without a duplicate row.
  async insertIfAbsent(record: AuditLogRecord): Promise<void> {
    await this.database.db
      .insert(auditLogs)
      .values(record)
      .onConflictDoNothing({ target: auditLogs.eventId });
  }
}
