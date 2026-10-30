import {
  ConflictError,
  ServiceName,
  type IInternalHttpClient,
  type InternalJsonPutRequest,
} from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import { AuthAccountAdministrationClient } from './auth-account-administration.client.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const ACTOR_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const NEW_PASSWORD = 'reset-pass-2';

// Records each PUT and answers with the given value, parsed by the schema the client passed, as the real client does.
function recordingHttpClient(
  recorded: InternalJsonPutRequest<unknown>[],
  answer: unknown,
): IInternalHttpClient {
  return {
    get: () => Promise.reject(new Error('The client never gets.')),
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: () => Promise.reject(new Error('The client never posts.')),
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: <TResponse>(request: InternalJsonPutRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve(request.responseSchema.parse(answer));
    },
    put: () => Promise.reject(new Error('The client never sends multipart.')),
  };
}

describe('AuthAccountAdministrationClient.resetPassword', () => {
  it('should put the HR actor and the new password to the reset route with this service token and no user token', async () => {
    const recorded: InternalJsonPutRequest<unknown>[] = [];
    const client = new AuthAccountAdministrationClient(recordingHttpClient(recorded, undefined));

    await client.resetPassword(ACCOUNT_ID, { actorAccountId: ACTOR_ID, newPassword: NEW_PASSWORD });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: `/api/v1/internal/accounts/${ACCOUNT_ID}/password`,
      body: { actorAccountId: ACTOR_ID, newPassword: NEW_PASSWORD },
    });
    expect(recorded[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should resolve when Auth answers 204 with no body', async () => {
    const client = new AuthAccountAdministrationClient(recordingHttpClient([], undefined));

    await expect(
      client.resetPassword(ACCOUNT_ID, { actorAccountId: ACTOR_ID, newPassword: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
  });
});

describe('AuthAccountAdministrationClient.setActiveStatus', () => {
  it('should put the HR actor and the flag to the active-status route with this service token and no user token', async () => {
    const recorded: InternalJsonPutRequest<unknown>[] = [];
    const client = new AuthAccountAdministrationClient(
      recordingHttpClient(recorded, { isActive: false }),
    );

    await client.setActiveStatus(ACCOUNT_ID, { actorAccountId: ACTOR_ID, isActive: false });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: `/api/v1/internal/accounts/${ACCOUNT_ID}/active-status`,
      body: { actorAccountId: ACTOR_ID, isActive: false },
    });
    expect(recorded[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should return the stored flag that Auth answers with', async () => {
    const client = new AuthAccountAdministrationClient(recordingHttpClient([], { isActive: true }));

    await expect(
      client.setActiveStatus(ACCOUNT_ID, { actorAccountId: ACTOR_ID, isActive: true }),
    ).resolves.toEqual({ isActive: true });
  });

  it('should reject with the Auth refusal unchanged when Auth refuses the change', async () => {
    const refusal = new ConflictError(ErrorCode.CONFLICT, 'Refused.');
    const httpClient: IInternalHttpClient = {
      ...recordingHttpClient([], undefined),
      putJson: () => Promise.reject(refusal),
    };
    const client = new AuthAccountAdministrationClient(httpClient);

    await expect(
      client.setActiveStatus(ACCOUNT_ID, { actorAccountId: ACTOR_ID, isActive: false }),
    ).rejects.toBe(refusal);
  });
});
