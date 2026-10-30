import { ServiceName, type IInternalHttpClient, type InternalPostRequest } from '@dexa/common';
import { AuthAccountClient } from './auth-account.client.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const ACCOUNT = { id: ACCOUNT_ID, email: 'nadia.rahma@dexa.test', role: 'EMPLOYEE' };

// Records each POST and answers with the given accounts, parsed by the response schema the client passed,
// so the answer is shaped the way the real client would receive it.
function recordingHttpClient(
  recorded: InternalPostRequest<unknown>[],
  answer: unknown,
): IInternalHttpClient {
  return {
    get: () => Promise.reject(new Error('The client never gets.')),
    post: <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve(request.responseSchema.parse(answer));
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
  };
}

describe('AuthAccountClient', () => {
  it('should post the account ID to the internal lookup with this service token and no user token', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new AuthAccountClient(recordingHttpClient(recorded, [ACCOUNT]));

    await client.findAccountById(ACCOUNT_ID);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: '/api/v1/internal/accounts/lookup',
      body: { ids: [ACCOUNT_ID] },
    });
    expect(recorded[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should return the account when the lookup answers with it', async () => {
    const client = new AuthAccountClient(recordingHttpClient([], [ACCOUNT]));

    await expect(client.findAccountById(ACCOUNT_ID)).resolves.toEqual(ACCOUNT);
  });

  it('should return undefined when the lookup omits the account', async () => {
    const client = new AuthAccountClient(
      recordingHttpClient([], [{ ...ACCOUNT, id: OTHER_ACCOUNT_ID }]),
    );

    await expect(client.findAccountById(ACCOUNT_ID)).resolves.toBeUndefined();
  });
});
