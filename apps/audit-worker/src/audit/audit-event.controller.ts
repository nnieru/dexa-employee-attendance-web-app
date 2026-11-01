import { EventName } from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AuditService } from './audit.service.js';

// Event handlers only. The queue binding comes from connectEventConsumer, and the ack interceptor settles each
// delivery after the handler resolves.
@Controller()
export class AuditEventController {
  constructor(private readonly audit: AuditService) {}

  @EventPattern(EventName.EMPLOYEE_PROFILE_UPDATED)
  onEmployeeProfileUpdated(@Payload() event: EventMessage): Promise<void> {
    return this.audit.recordEvent(event);
  }

  @EventPattern(EventName.ACCOUNT_PASSWORD_CHANGED)
  onAccountPasswordChanged(@Payload() event: EventMessage): Promise<void> {
    return this.audit.recordEvent(event);
  }

  @EventPattern(EventName.ATTENDANCE_REQUEST_SUBMITTED)
  onAttendanceRequestSubmitted(@Payload() event: EventMessage): Promise<void> {
    return this.audit.recordEvent(event);
  }

  @EventPattern(EventName.ATTENDANCE_REQUEST_APPROVED)
  onAttendanceRequestApproved(@Payload() event: EventMessage): Promise<void> {
    return this.audit.recordEvent(event);
  }

  @EventPattern(EventName.ATTENDANCE_REQUEST_REJECTED)
  onAttendanceRequestRejected(@Payload() event: EventMessage): Promise<void> {
    return this.audit.recordEvent(event);
  }
}
