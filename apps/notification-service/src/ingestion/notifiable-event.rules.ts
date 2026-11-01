import {
  ACCOUNT_PASSWORD_CHANGED_FIELD,
  accountPasswordChangedPayloadSchema,
  attendanceRequestEventPayloadSchema,
  employeeProfileUpdatedPayloadSchema,
  EventName,
  type AttendanceRequestResourceType,
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

// The requester is actorAccountId. The event names no field, and it carries no reason (PRD APR-7).
export type AttendanceRequestSubmittedNotifiableEvent = NotifiableEventBase & {
  readonly eventType: typeof EventName.ATTENDANCE_REQUEST_SUBMITTED;
  readonly resourceType: AttendanceRequestResourceType;
  readonly resourceId: string;
  readonly businessDate: string;
};

/** The events the notification service turns into HR inbox rows (ADM-5, EVT-2, PRD APR-7). */
export type NotifiableEvent =
  | ProfileUpdatedNotifiableEvent
  | PasswordChangedNotifiableEvent
  | AttendanceRequestSubmittedNotifiableEvent;

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
  if (event.type === EventName.ATTENDANCE_REQUEST_SUBMITTED) {
    return decideAttendanceRequestSubmitted(event);
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

function decideAttendanceRequestSubmitted(event: EventMessage): NotifiableEventDecision {
  const payload = attendanceRequestEventPayloadSchema.safeParse(event.payload);
  if (!payload.success) {
    return { kind: 'rejected', reason: 'invalid-payload' };
  }
  return {
    kind: 'accepted',
    event: {
      eventType: EventName.ATTENDANCE_REQUEST_SUBMITTED,
      eventId: event.eventId,
      occurredAt: new Date(event.occurredAt),
      subjectAccountId: payload.data.accountId,
      actorAccountId: payload.data.actorAccountId,
      changedFields: payload.data.changedFields,
      resourceType: payload.data.resourceType,
      resourceId: payload.data.resourceId,
      businessDate: payload.data.businessDate,
    },
  };
}
