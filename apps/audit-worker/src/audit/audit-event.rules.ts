import { ServiceName } from '@dexa/common';
import {
  accountPasswordChangedPayloadSchema,
  attendanceRequestEventPayloadSchema,
  employeeProfileUpdatedPayloadSchema,
  EventName,
} from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';
import type { ZodType } from 'zod';

/** One audit_logs row (DATABASE §6). Holds field names only, never values or password material. */
export type AuditLogRecord = {
  readonly eventId: string;
  readonly eventType: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly sourceService: string;
  readonly accountId: string;
  readonly actorAccountId: string;
  readonly changedFields: ReadonlyArray<string>;
  readonly occurredAt: Date;
  readonly processedAt: Date;
};

export type AuditRejectionReason = 'unsupported-event-type' | 'invalid-payload';

export type AuditRecordDecision =
  | { readonly kind: 'accepted'; readonly record: AuditLogRecord }
  | { readonly kind: 'rejected'; readonly reason: AuditRejectionReason };

type AuditedPayload = {
  readonly accountId: string;
  readonly actorAccountId: string;
  readonly changedFields: ReadonlyArray<string>;
  readonly resourceType?: string;
  readonly resourceId?: string;
};

type AuditedEventDefinition = {
  readonly sourceService: string;
  readonly payloadSchema: ZodType<AuditedPayload>;
};

// One entry per event type the audit ledger records. Adding a type means adding one entry and its contract schema.
const AUDITED_EVENTS: ReadonlyMap<string, AuditedEventDefinition> = new Map<
  string,
  AuditedEventDefinition
>([
  [
    EventName.EMPLOYEE_PROFILE_UPDATED,
    {
      sourceService: ServiceName.EMPLOYEE_SERVICE,
      payloadSchema: employeeProfileUpdatedPayloadSchema,
    },
  ],
  [
    EventName.ACCOUNT_PASSWORD_CHANGED,
    {
      sourceService: ServiceName.AUTH_SERVICE,
      payloadSchema: accountPasswordChangedPayloadSchema,
    },
  ],
  [
    EventName.ATTENDANCE_REQUEST_SUBMITTED,
    {
      sourceService: ServiceName.ATTENDANCE_SERVICE,
      payloadSchema: attendanceRequestEventPayloadSchema,
    },
  ],
  [
    EventName.ATTENDANCE_REQUEST_APPROVED,
    {
      sourceService: ServiceName.ATTENDANCE_SERVICE,
      payloadSchema: attendanceRequestEventPayloadSchema,
    },
  ],
  [
    EventName.ATTENDANCE_REQUEST_REJECTED,
    {
      sourceService: ServiceName.ATTENDANCE_SERVICE,
      payloadSchema: attendanceRequestEventPayloadSchema,
    },
  ],
]);

/**
 * Maps a consumed event to the audit row it produces. The payload is checked against the contract schema of
 * its event type, and the schema is strict, so a payload that carries a value or a secret is rejected instead
 * of being stored. The caller supplies processedAt, so this function reads no clock.
 */
export function decideAuditRecord(event: EventMessage, processedAt: Date): AuditRecordDecision {
  const definition = AUDITED_EVENTS.get(event.type);
  if (definition === undefined) {
    return { kind: 'rejected', reason: 'unsupported-event-type' };
  }
  const payload = definition.payloadSchema.safeParse(event.payload);
  if (!payload.success) {
    return { kind: 'rejected', reason: 'invalid-payload' };
  }
  return {
    kind: 'accepted',
    record: {
      eventId: event.eventId,
      eventType: event.type,
      resourceType: payload.data.resourceType,
      resourceId: payload.data.resourceId,
      sourceService: definition.sourceService,
      accountId: payload.data.accountId,
      actorAccountId: payload.data.actorAccountId,
      changedFields: payload.data.changedFields,
      occurredAt: new Date(event.occurredAt),
      processedAt,
    },
  };
}
