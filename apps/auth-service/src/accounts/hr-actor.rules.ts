import { Role } from '@dexa/contracts';

/** The account state that decides whether an account may act as HR for other accounts. */
export type HrActorAccount = {
  readonly roleCode: string;
  readonly isActive: boolean;
  readonly isProvisioningPending: boolean;
};

/** Only an active HR account that is past its own provisioning may create or administer accounts (D-16, DATABASE §3.1). */
export function isEligibleHrActor(actor: HrActorAccount | undefined): boolean {
  return (
    actor !== undefined &&
    actor.roleCode === Role.HR &&
    actor.isActive &&
    !actor.isProvisioningPending
  );
}
