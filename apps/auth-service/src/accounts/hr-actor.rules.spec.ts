import { Role } from '@dexa/contracts';
import { isEligibleHrActor, type HrActorAccount } from './hr-actor.rules.js';

describe('isEligibleHrActor', () => {
  const ACTIVE_HR: HrActorAccount = {
    roleCode: Role.HR,
    isActive: true,
    isProvisioningPending: false,
  };

  it.each([
    { condition: 'the actor is an active HR account', actor: ACTIVE_HR, expected: true },
    {
      condition: 'the actor is an EMPLOYEE account',
      actor: { ...ACTIVE_HR, roleCode: Role.EMPLOYEE },
      expected: false,
    },
    {
      condition: 'the actor is inactive',
      actor: { ...ACTIVE_HR, isActive: false },
      expected: false,
    },
    {
      condition: 'the actor is still PENDING provisioning',
      actor: { ...ACTIVE_HR, isProvisioningPending: true },
      expected: false,
    },
    { condition: 'the actor does not exist', actor: undefined, expected: false },
  ])('should return $expected when $condition', ({ actor, expected }) => {
    expect(isEligibleHrActor(actor)).toBe(expected);
  });
});
