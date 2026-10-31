import { Module } from '@nestjs/common';
import { AuditEventController } from './audit-event.controller.js';
import { AuditLogRepository } from './audit-log.repository.js';
import { AUDIT_LOG_WRITER } from './audit-log-writer.interface.js';
import { AuditService } from './audit.service.js';

@Module({
  controllers: [AuditEventController],
  providers: [AuditService, { provide: AUDIT_LOG_WRITER, useClass: AuditLogRepository }],
})
export class AuditModule {}
