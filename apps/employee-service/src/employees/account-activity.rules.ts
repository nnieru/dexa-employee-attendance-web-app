/** The employee status that deactivates the account. Every other status keeps the account active. */
export const INACTIVE_EMPLOYEE_STATUS_CODE = 'INACTIVE';

export const AccountActivityChange = {
  DEACTIVATE: 'DEACTIVATE',
  REACTIVATE: 'REACTIVATE',
} as const;

export type AccountActivityChange =
  (typeof AccountActivityChange)[keyof typeof AccountActivityChange];

export function isActiveStatusCode(statusCode: string): boolean {
  return statusCode !== INACTIVE_EMPLOYEE_STATUS_CODE;
}

/**
 * The Auth change that a requested status requires: INACTIVE deactivates, and any other status activates. The
 * change is required even when the stored status already matches, because Auth may still hold a flag from an earlier
 * change whose answer was lost. Auth's route is idempotent, so restating the flag is safe.
 */
export function resolveRequiredAccountActivity(requestedStatusCode: string): AccountActivityChange {
  return isActiveStatusCode(requestedStatusCode)
    ? AccountActivityChange.REACTIVATE
    : AccountActivityChange.DEACTIVATE;
}

/** An HR account cannot deactivate itself. Auth refuses the same change, so this is checked before any write. */
export function isSelfDeactivation(change: {
  readonly actorAccountId: string;
  readonly targetAccountId: string;
  readonly activityChange: AccountActivityChange | undefined;
}): boolean {
  return (
    change.activityChange === AccountActivityChange.DEACTIVATE &&
    change.actorAccountId === change.targetAccountId
  );
}
