import {
  EventName,
  attendanceRequestEventPayloadSchema,
  type AttendanceRequestResourceType,
} from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';

export type AttendanceRequestEventType =
  | typeof EventName.ATTENDANCE_REQUEST_SUBMITTED
  | typeof EventName.ATTENDANCE_REQUEST_APPROVED
  | typeof EventName.ATTENDANCE_REQUEST_REJECTED;

export type AttendanceRequestEventInput = {
  readonly eventId: string;
  readonly eventType: AttendanceRequestEventType;
  readonly occurredAt: Date;
  readonly accountId: string;
  readonly actorAccountId: string;
  readonly resourceType: AttendanceRequestResourceType;
  readonly resourceId: string;
  readonly businessDate: string;
};

/**
 * Builds the event envelope for attendance request events (submitted, approved, rejected)
 * per ARCHITECTURE §8 and PRD APR-7.
 *
 * The payload carries resource identity and business date only. Reasons, times, status details,
 * or tokens are never part of the payload.
 */
export function buildAttendanceRequestEvent(input: AttendanceRequestEventInput): EventMessage {
  return {
    eventId: input.eventId,
    type: input.eventType,
    occurredAt: input.occurredAt.toISOString(),
    payload: attendanceRequestEventPayloadSchema.parse({
      accountId: input.accountId,
      actorAccountId: input.actorAccountId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      businessDate: input.businessDate,
      changedFields: [],
    }),
  };
}
