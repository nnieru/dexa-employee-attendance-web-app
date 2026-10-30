/** The account state that decides whether HR may act on an account. */
export type AdministeredAccount = {
  readonly isProvisioningPending: boolean;
};

/**
 * HR reaches only accounts that provisioning has activated (DATABASE §3.1). A missing or still-provisioning
 * account is refused the same way, so HR cannot tell a pending account from one that does not exist.
 */
export function isAdministrableAccount(account: AdministeredAccount | undefined): boolean {
  return account !== undefined && !account.isProvisioningPending;
}

/**
 * An HR account cannot deactivate itself (D-13, D-25). Restating the current active flag, or
 * reactivating, is not a self-deactivation.
 */
export function isSelfDeactivation(change: {
  readonly actorAccountId: string;
  readonly targetAccountId: string;
  readonly isActive: boolean;
}): boolean {
  return !change.isActive && change.actorAccountId === change.targetAccountId;
}
