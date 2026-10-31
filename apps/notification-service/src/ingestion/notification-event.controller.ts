import { EventName } from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationIngestionService } from './notification-ingestion.service.js';

// Event handlers only. The queue binding comes from connectEventConsumer, and the ack interceptor settles each
// delivery after the handler resolves.
@Controller()
export class NotificationEventController {
  constructor(private readonly ingestion: NotificationIngestionService) {}

  @EventPattern(EventName.EMPLOYEE_PROFILE_UPDATED)
  onEmployeeProfileUpdated(@Payload() event: EventMessage): Promise<void> {
    return this.ingestion.recordEvent(event);
  }

  @EventPattern(EventName.ACCOUNT_PASSWORD_CHANGED)
  onAccountPasswordChanged(@Payload() event: EventMessage): Promise<void> {
    return this.ingestion.recordEvent(event);
  }
}
