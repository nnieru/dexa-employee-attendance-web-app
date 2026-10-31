import type { AuditLogRecord } from './audit-event.rules.js';

export interface IAuditLogWriter {
  /**
   * Stores the record, or does nothing when a row with the same event ID already exists. Resolves once the
   * insert has committed, which is the point where the consumer may acknowledge the message.
   */
  insertIfAbsent(record: AuditLogRecord): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol('IAuditLogWriter');
