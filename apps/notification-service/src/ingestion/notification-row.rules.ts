import type { NotifiableEvent, NotifiableField } from './notifiable-event.rules.js';
import type { NotificationText } from './notification-text.rules.js';

/** One inbox row for one HR recipient (DATABASE §7.1), before the database assigns its id. */
export type NotificationDraft = {
  readonly eventId: string;
  readonly eventType: NotifiableEvent['eventType'];
  readonly recipientAccountId: string;
  readonly subjectAccountId: string;
  readonly actorAccountId: string;
  readonly title: string;
  readonly body: string;
  readonly data: { readonly changedFields: ReadonlyArray<NotifiableField> };
  readonly occurredAt: Date;
  readonly createdAt: Date;
};

export type BuildNotificationRowsInput = {
  readonly event: NotifiableEvent;
  readonly text: NotificationText;
  readonly recipientAccountIds: ReadonlyArray<string>;
  readonly createdAt: Date;
};

/**
 * One draft per HR recipient. Both notified events name no excluded account, so the actor and the subject
 * are recipients like any other active HR account (DATABASE §7).
 */
export function buildNotificationRows(input: BuildNotificationRowsInput): NotificationDraft[] {
  const { event, text, createdAt } = input;
  return input.recipientAccountIds.map((recipientAccountId) => ({
    eventId: event.eventId,
    eventType: event.eventType,
    recipientAccountId,
    subjectAccountId: event.subjectAccountId,
    actorAccountId: event.actorAccountId,
    title: text.title,
    body: text.body,
    data: { changedFields: event.changedFields },
    occurredAt: event.occurredAt,
    createdAt,
  }));
}
