import { CLOCK, type IClock } from '@dexa/common';
import { NonRetryableMessageError, type EventMessage } from '@dexa/messaging';
import { Inject, Injectable } from '@nestjs/common';
import { decideAuditRecord } from './audit-event.rules.js';
import { AUDIT_LOG_WRITER, type IAuditLogWriter } from './audit-log-writer.interface.js';

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogs: IAuditLogWriter,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  /**
   * Resolves once the audit row is committed. A rejected event throws NonRetryableMessageError, so the
   * consumer dead-letters it on the first delivery. A database failure propagates as a transient error and the
   * broker redelivers the message.
   */
  async recordEvent(event: EventMessage): Promise<void> {
    const decision = decideAuditRecord(event, this.clock.now());
    if (decision.kind === 'rejected') {
      throw new NonRetryableMessageError(`Audit event rejected: ${decision.reason}`);
    }
    await this.auditLogs.insertIfAbsent(decision.record);
  }
}
