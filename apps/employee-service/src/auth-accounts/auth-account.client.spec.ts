import {
  DependencyUnavailableError,
  NotFoundError,
  ServiceName,
  type IInternalHttpClient,
  type InternalGetRequest,
  type InternalPostRequest,
} from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import { AuthAccountClient } from './auth-account.client.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const ACCOUNT = { id: ACCOUNT_ID, email: 'nadia.rahma@dexa.test', role: 'EMPLOYEE' };
const ACCOUNT_EMAIL = 'nadia.rahma@dexa.test';

// Records each POST and answers with the given accounts, parsed by the response schema the client passed,
// so the answer is shaped the way the real client would receive it.
function recordingHttpClient(
  recorded: InternalPostRequest<unknown>[],
  answer: unknown,
): IInternalHttpClient {
  return {
    get: () => Promise.reject(new Error('The client never gets.')),
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve(request.responseSchema.parse(answer));
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
  };
}

// Records each GET and answers with the given value, or fails with the given error. The answer is parsed by
// the response schema the client passed, as the real client would parse it.
function recordingGetClient(
  recorded: InternalGetRequest<unknown>[],
  respond: () => Promise<unknown>,
): IInternalHttpClient {
  return {
    get: async <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return request.responseSchema.parse(await respond());
    },
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: () => Promise.reject(new Error('The client never posts.')),
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
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

describe('AuthAccountClient.findAccountReferenceByEmail', () => {
  it('should get the by-email lookup with the email and this service token and no user token', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new AuthAccountClient(
      recordingGetClient(recorded, () => Promise.resolve({ id: ACCOUNT_ID, role: 'HR' })),
    );

    await client.findAccountReferenceByEmail(ACCOUNT_EMAIL);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: '/api/v1/internal/accounts/by-email',
      query: { email: ACCOUNT_EMAIL },
    });
    expect(recorded[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should return the account ID and role when Auth answers with them', async () => {
    const client = new AuthAccountClient(
      recordingGetClient([], () => Promise.resolve({ id: ACCOUNT_ID, role: 'HR' })),
    );

    await expect(client.findAccountReferenceByEmail(ACCOUNT_EMAIL)).resolves.toEqual({
      id: ACCOUNT_ID,
      role: 'HR',
    });
  });

  it('should return undefined when Auth answers 404 for the email', async () => {
    const client = new AuthAccountClient(
      recordingGetClient([], () =>
        Promise.reject(new NotFoundError(ErrorCode.NOT_FOUND, 'Not found.')),
      ),
    );

    await expect(client.findAccountReferenceByEmail(ACCOUNT_EMAIL)).resolves.toBeUndefined();
  });

  it('should reject when Auth is unavailable so that an outage never reads as no account', async () => {
    const outage = new DependencyUnavailableError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Unavailable.');
    const client = new AuthAccountClient(recordingGetClient([], () => Promise.reject(outage)));

    await expect(client.findAccountReferenceByEmail(ACCOUNT_EMAIL)).rejects.toBe(outage);
  });
});

describe('AuthAccountClient.lookupAccounts', () => {
  it('should post every account ID in one lookup with this service token and no user token', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new AuthAccountClient(recordingHttpClient(recorded, [ACCOUNT]));

    await client.lookupAccounts([ACCOUNT_ID, OTHER_ACCOUNT_ID]);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: '/api/v1/internal/accounts/lookup',
      body: { ids: [ACCOUNT_ID, OTHER_ACCOUNT_ID] },
    });
    expect(recorded[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should return every account that Auth answers with, and omit the rest', async () => {
    const other = { id: OTHER_ACCOUNT_ID, email: 'bima.saputra@dexa.test', role: 'HR' };
    const client = new AuthAccountClient(recordingHttpClient([], [ACCOUNT, other]));

    await expect(client.lookupAccounts([ACCOUNT_ID, OTHER_ACCOUNT_ID])).resolves.toEqual([
      ACCOUNT,
      other,
    ]);
  });
});

describe('AuthAccountClient.searchAccountIdsByEmail', () => {
  it('should get the search with the term as the email query and this service token and no user token', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new AuthAccountClient(
      recordingGetClient(recorded, () => Promise.resolve({ ids: [ACCOUNT_ID] })),
    );

    await client.searchAccountIdsByEmail('rahma');

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: '/api/v1/internal/accounts/search',
      query: { email: 'rahma' },
    });
    expect(recorded[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should return the matching account IDs when Auth answers with them', async () => {
    const client = new AuthAccountClient(
      recordingGetClient([], () => Promise.resolve({ ids: [ACCOUNT_ID, OTHER_ACCOUNT_ID] })),
    );

    await expect(client.searchAccountIdsByEmail('rahma')).resolves.toEqual([
      ACCOUNT_ID,
      OTHER_ACCOUNT_ID,
    ]);
  });

  it('should reject when Auth is unavailable so that an outage never reads as no match', async () => {
    const outage = new DependencyUnavailableError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Unavailable.');
    const client = new AuthAccountClient(recordingGetClient([], () => Promise.reject(outage)));

    await expect(client.searchAccountIdsByEmail('rahma')).rejects.toBe(outage);
  });
});
