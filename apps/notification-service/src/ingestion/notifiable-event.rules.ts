import {
  ACCOUNT_PASSWORD_CHANGED_FIELD,
  accountPasswordChangedPayloadSchema,
  employeeProfileUpdatedPayloadSchema,
  EventName,
  type ProfileField,
} from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';

/** A field name that an event may report as changed. Names only, never values (ARCHITECTURE §8). */
export type NotifiableField = ProfileField | typeof ACCOUNT_PASSWORD_CHANGED_FIELD;

type NotifiableEventBase = {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly subjectAccountId: string;
  readonly actorAccountId: string;
  readonly changedFields: ReadonlyArray<NotifiableField>;
};

export type ProfileUpdatedNotifiableEvent = NotifiableEventBase & {
  readonly eventType: typeof EventName.EMPLOYEE_PROFILE_UPDATED;
  readonly employeeName: string;
};

export type PasswordChangedNotifiableEvent = NotifiableEventBase & {
  readonly eventType: typeof EventName.ACCOUNT_PASSWORD_CHANGED;
};

/** The two events the notification service turns into HR inbox rows (ADM-5, EVT-2). */
export type NotifiableEvent = ProfileUpdatedNotifiableEvent | PasswordChangedNotifiableEvent;

export type NotifiableEventRejectionReason = 'unsupported-event-type' | 'invalid-payload';

export type NotifiableEventDecision =
  | { readonly kind: 'accepted'; readonly event: NotifiableEvent }
  | { readonly kind: 'rejected'; readonly reason: NotifiableEventRejectionReason };

/**
 * Checks a consumed event against the contract schema of its type. The schemas are strict, so a payload that
 * carries a value, a hash, or a token is rejected instead of being turned into a notification. The caller supplies
 * nothing else: this reads no clock and no database.
 */
export function decideNotifiableEvent(event: EventMessage): NotifiableEventDecision {
  if (event.type === EventName.EMPLOYEE_PROFILE_UPDATED) {
    return decideProfileUpdated(event);
  }
  if (event.type === EventName.ACCOUNT_PASSWORD_CHANGED) {
    return decidePasswordChanged(event);
  }
  return { kind: 'rejected', reason: 'unsupported-event-type' };
}

function decideProfileUpdated(event: EventMessage): NotifiableEventDecision {
  const payload = employeeProfileUpdatedPayloadSchema.safeParse(event.payload);
  if (!payload.success) {
    return { kind: 'rejected', reason: 'invalid-payload' };
  }
  return {
    kind: 'accepted',
    event: {
      eventType: EventName.EMPLOYEE_PROFILE_UPDATED,
      eventId: event.eventId,
      occurredAt: new Date(event.occurredAt),
      subjectAccountId: payload.data.accountId,
      actorAccountId: payload.data.actorAccountId,
      changedFields: payload.data.changedFields,
      employeeName: payload.data.employeeName,
    },
  };
}

function decidePasswordChanged(event: EventMessage): NotifiableEventDecision {
  const payload = accountPasswordChangedPayloadSchema.safeParse(event.payload);
  if (!payload.success) {
    return { kind: 'rejected', reason: 'invalid-payload' };
  }
  return {
    kind: 'accepted',
    event: {
      eventType: EventName.ACCOUNT_PASSWORD_CHANGED,
      eventId: event.eventId,
      occurredAt: new Date(event.occurredAt),
      subjectAccountId: payload.data.accountId,
      actorAccountId: payload.data.actorAccountId,
      changedFields: payload.data.changedFields,
    },
  };
}
