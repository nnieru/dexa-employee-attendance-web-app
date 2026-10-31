import { ServiceName, type IInternalHttpClient, type InternalPostRequest } from '@dexa/common';
import { EmployeeClient } from './employee.client.js';
import { dependencyOutage } from '../../test/scripted-clients.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const EMPLOYEE = {
  accountId: ACCOUNT_ID,
  name: 'Ada Lovelace',
  positionName: 'Fullstack Developer',
};

// Records each POST and answers with the given value, or fails with the given error. The answer is parsed by the
// response schema the client passed, as the real client would parse it.
function recordingHttpClient(
  recorded: InternalPostRequest<unknown>[],
  respond: () => Promise<unknown>,
): IInternalHttpClient {
  return {
    get: () => Promise.reject(new Error('The client never gets.')),
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: async <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return request.responseSchema.parse(await respond());
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
    delete: () => Promise.reject(new Error('The client never deletes.')),
  };
}

describe('EmployeeClient.lookupEmployees', () => {
  it('should post every account ID in one lookup with this service token and no user token', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new EmployeeClient(recordingHttpClient(recorded, () => Promise.resolve([])));

    await client.lookupEmployees([ACCOUNT_ID, OTHER_ACCOUNT_ID]);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: '/api/v1/internal/employees/lookup',
      body: { accountIds: [ACCOUNT_ID, OTHER_ACCOUNT_ID] },
    });
    expect(recorded[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should return the employees that Employee answers with', async () => {
    const client = new EmployeeClient(recordingHttpClient([], () => Promise.resolve([EMPLOYEE])));

    await expect(client.lookupEmployees([ACCOUNT_ID, OTHER_ACCOUNT_ID])).resolves.toEqual([
      EMPLOYEE,
    ]);
  });

  it('should reject when Employee is unavailable so that an outage never reads as unknown accounts', async () => {
    const outage = dependencyOutage();
    const client = new EmployeeClient(recordingHttpClient([], () => Promise.reject(outage)));

    await expect(client.lookupEmployees([ACCOUNT_ID])).rejects.toBe(outage);
  });
});
