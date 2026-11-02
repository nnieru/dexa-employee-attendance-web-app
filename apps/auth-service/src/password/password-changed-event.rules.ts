import {
  ACCOUNT_PASSWORD_CHANGED_FIELD,
  accountPasswordChangedPayloadSchema,
  EventName,
} from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';

export type PasswordChangedEventInput = {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly accountId: string;
  readonly actorAccountId: string;
};

/**
 * Builds the account.password.changed envelope. The payload names only the
 * field that changed. It is built from these named inputs, so no password, hash, or token can reach
 * it, and the strict payload schema rejects any extra key that a caller might still add.
 * The profile-change event rebuilder reuses this builder with the HR account as the actor.
 */
export function buildPasswordChangedEvent(input: PasswordChangedEventInput): EventMessage {
  return {
    eventId: input.eventId,
    type: EventName.ACCOUNT_PASSWORD_CHANGED,
    occurredAt: input.occurredAt.toISOString(),
    payload: accountPasswordChangedPayloadSchema.parse({
      accountId: input.accountId,
      actorAccountId: input.actorAccountId,
      changedFields: [ACCOUNT_PASSWORD_CHANGED_FIELD],
    }),
  };
}
