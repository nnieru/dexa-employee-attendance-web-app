import type { EmployeeLookupItem } from '@dexa/contracts';
import type { IEmployeeClient } from './employee-client.interface.js';
import { findEmployeeNamesByAccountId } from './employee-name-lookup.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const UNKNOWN_ACCOUNT_ID = '0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b';

// Records each call and answers with the profiles of the accounts it knows.
function recordingEmployeeClient(known: EmployeeLookupItem[], calls: string[][]): IEmployeeClient {
  return {
    lookupEmployees: (accountIds) => {
      calls.push([...accountIds]);
      return Promise.resolve(known.filter((profile) => accountIds.includes(profile.accountId)));
    },
  };
}

const KNOWN_PROFILE = { accountId: ACCOUNT_ID, name: 'Nadia Rahma', positionName: 'Engineer' };

describe('findEmployeeNamesByAccountId', () => {
  it('should answer the name of each known account from one lookup', async () => {
    const calls: string[][] = [];
    const client = recordingEmployeeClient(
      [KNOWN_PROFILE, { accountId: OTHER_ACCOUNT_ID, name: 'Budi Santoso', positionName: 'QA' }],
      calls,
    );

    const names = await findEmployeeNamesByAccountId(client, [ACCOUNT_ID, OTHER_ACCOUNT_ID]);

    expect(calls).toEqual([[ACCOUNT_ID, OTHER_ACCOUNT_ID]]);
    expect(names.get(ACCOUNT_ID)).toBe('Nadia Rahma');
    expect(names.get(OTHER_ACCOUNT_ID)).toBe('Budi Santoso');
  });

  it('should leave an unknown account out of the answer so that it reads as unnamed', async () => {
    const calls: string[][] = [];
    const client = recordingEmployeeClient([KNOWN_PROFILE], calls);

    const names = await findEmployeeNamesByAccountId(client, [ACCOUNT_ID, UNKNOWN_ACCOUNT_ID]);

    expect(names.has(UNKNOWN_ACCOUNT_ID)).toBe(false);
    expect(names.get(ACCOUNT_ID)).toBe('Nadia Rahma');
  });

  it('should ask for each account once when the page repeats it', async () => {
    const calls: string[][] = [];
    const client = recordingEmployeeClient([KNOWN_PROFILE], calls);

    await findEmployeeNamesByAccountId(client, [ACCOUNT_ID, ACCOUNT_ID, ACCOUNT_ID]);

    expect(calls).toEqual([[ACCOUNT_ID]]);
  });

  it('should make no call and answer an empty map when there are no accounts', async () => {
    const calls: string[][] = [];
    const client = recordingEmployeeClient([KNOWN_PROFILE], calls);

    const names = await findEmployeeNamesByAccountId(client, []);

    expect(calls).toHaveLength(0);
    expect(names.size).toBe(0);
  });
});
