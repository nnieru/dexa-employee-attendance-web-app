import { EventName, type AttendanceRequestResourceType } from '@dexa/contracts';
import type { NotifiableEvent, NotifiableField } from './notifiable-event.rules.js';
import type { NotificationText } from './notification-text.rules.js';

/** The data a row carries: changed field names, plus the request resource for an attendance request. */
export type NotificationData = {
  readonly changedFields: ReadonlyArray<NotifiableField>;
  readonly resourceType?: AttendanceRequestResourceType;
  readonly resourceId?: string;
  readonly businessDate?: string;
};

/** One inbox row for one HR recipient, before the database assigns its id. */
export type NotificationDraft = {
  readonly eventId: string;
  readonly eventType: NotifiableEvent['eventType'];
  readonly recipientAccountId: string;
  readonly subjectAccountId: string;
  readonly actorAccountId: string;
  readonly title: string;
  readonly body: string;
  readonly data: NotificationData;
  readonly occurredAt: Date;
  readonly createdAt: Date;
};

/**
 * The HR accounts that receive an attendance request notification: every active HR account except the
 * employee who submitted the request. An HR requester sees no popup and no inbox row for their own request.
 */
export function excludeRequesterFromRecipients(
  recipientAccountIds: ReadonlyArray<string>,
  requesterAccountId: string,
): string[] {
  return recipientAccountIds.filter(
    (recipientAccountId) => recipientAccountId !== requesterAccountId,
  );
}

export type BuildNotificationRowsInput = {
  readonly event: NotifiableEvent;
  readonly text: NotificationText;
  readonly recipientAccountIds: ReadonlyArray<string>;
  readonly createdAt: Date;
};

/**
 * One draft per HR recipient. Only an attendance request excludes an account (its requester); the profile and password
 * events name no excluded account, so the actor and the subject are recipients like any other active HR account
 *
 */
export function buildNotificationRows(input: BuildNotificationRowsInput): NotificationDraft[] {
  const { event, text, createdAt } = input;
  const data = describeNotificationData(event);
  return selectRecipientAccountIds(event, input.recipientAccountIds).map((recipientAccountId) => ({
    eventId: event.eventId,
    eventType: event.eventType,
    recipientAccountId,
    subjectAccountId: event.subjectAccountId,
    actorAccountId: event.actorAccountId,
    title: text.title,
    body: text.body,
    data,
    occurredAt: event.occurredAt,
    createdAt,
  }));
}

function selectRecipientAccountIds(
  event: NotifiableEvent,
  recipientAccountIds: ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (event.eventType === EventName.ATTENDANCE_REQUEST_SUBMITTED) {
    return excludeRequesterFromRecipients(recipientAccountIds, event.actorAccountId);
  }
  return recipientAccountIds;
}

// Explicit mapping per event type, so no event key reaches the row by spreading the event.
function describeNotificationData(event: NotifiableEvent): NotificationData {
  if (event.eventType === EventName.ATTENDANCE_REQUEST_SUBMITTED) {
    return {
      changedFields: event.changedFields,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      businessDate: event.businessDate,
    };
  }
  return { changedFields: event.changedFields };
}
