import { CLOCK, type IClock } from '@dexa/common';
import { EventName } from '@dexa/contracts';
import { NonRetryableMessageError, type EventMessage } from '@dexa/messaging';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_CLIENT, type IAuthClient } from './auth-client.interface.js';
import { EMPLOYEE_CLIENT, type IEmployeeClient } from './employee-client.interface.js';
import { decideNotifiableEvent, type NotifiableEvent } from './notifiable-event.rules.js';
import {
  NOTIFICATION_PUBLISHER,
  type INotificationPublisher,
} from './notification-publisher.interface.js';
import { buildNotificationRows } from './notification-row.rules.js';
import { describeNotification, resolveEmployeeName } from './notification-text.rules.js';
import { NOTIFICATION_WRITER, type INotificationWriter } from './notification-writer.interface.js';

@Injectable()
export class NotificationIngestionService {
  constructor(
    @Inject(AUTH_CLIENT) private readonly auth: IAuthClient,
    @Inject(EMPLOYEE_CLIENT) private readonly employees: IEmployeeClient,
    @Inject(NOTIFICATION_WRITER) private readonly notifications: INotificationWriter,
    @Inject(NOTIFICATION_PUBLISHER) private readonly publisher: INotificationPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  /**
   * Resolves once the inbox rows are committed. A rejected payload throws NonRetryableMessageError, so the consumer
   * dead-letters it on the first delivery. A failed Auth or Employee call happens before any insert and propagates as
   * a transient error, so the broker redelivers the message and no partial rows are written. Only rows this call
   * inserted go to the live stream, so a redelivery pushes nothing again.
   */
  async recordEvent(event: EventMessage): Promise<void> {
    const decision = decideNotifiableEvent(event);
    if (decision.kind === 'rejected') {
      throw new NonRetryableMessageError(`Notification event rejected: ${decision.reason}`);
    }
    const notifiable = decision.event;
    const subjectName = await this.resolveDisplayName(notifiable);
    const recipientAccountIds = await this.auth.listHrRecipientIds();
    const drafts = buildNotificationRows({
      event: notifiable,
      text: describeNotification(notifiable, subjectName),
      recipientAccountIds,
      createdAt: this.clock.now(),
    });
    if (drafts.length === 0) {
      return;
    }
    const insertedNotifications = await this.notifications.insertForRecipients(drafts);
    if (insertedNotifications.length > 0) {
      this.publisher.publish(insertedNotifications);
    }
  }

  // The profile event carries the name. The password and request events do not, so the name comes from Employee in
  // one batched lookup: the affected account for a password change, the requester for an attendance request.
  private async resolveDisplayName(event: NotifiableEvent): Promise<string> {
    if (event.eventType === EventName.EMPLOYEE_PROFILE_UPDATED) {
      return event.employeeName;
    }
    const accountId =
      event.eventType === EventName.ACCOUNT_PASSWORD_CHANGED
        ? event.subjectAccountId
        : event.actorAccountId;
    const employees = await this.employees.lookupEmployees([accountId]);
    return resolveEmployeeName(employees, accountId);
  }
}
