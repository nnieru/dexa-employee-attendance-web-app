import { employeeProfileUpdatedPayloadSchema, EventName, type ProfileField } from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';

export type EmployeeProfileUpdatedEventInput = {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly accountId: string;
  readonly actorAccountId: string;
  readonly employeeName: string;
  readonly changedFields: ReadonlyArray<ProfileField>;
};

/**
 * Builds the employee.profile.updated envelope (ARCHITECTURE §8, DATABASE §4.3). The payload names the changed fields
 * only. It is built from these named inputs, so no old value, new value, password, or token can reach it, and the
 * strict payload schema rejects any extra key.
 */
export function buildEmployeeProfileUpdatedEvent(
  input: EmployeeProfileUpdatedEventInput,
): EventMessage {
  return {
    eventId: input.eventId,
    type: EventName.EMPLOYEE_PROFILE_UPDATED,
    occurredAt: input.occurredAt.toISOString(),
    payload: employeeProfileUpdatedPayloadSchema.parse({
      accountId: input.accountId,
      actorAccountId: input.actorAccountId,
      employeeName: input.employeeName,
      changedFields: [...input.changedFields],
    }),
  };
}
