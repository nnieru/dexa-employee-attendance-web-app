import {
  DependencyUnavailableError,
  ServiceName,
  type IInternalHttpClient,
  type InternalGetRequest,
  type InternalPostRequest,
} from '@dexa/common';
import {
  AccountProvisioningStatus,
  ErrorCode,
  type AccountProvisioningRequest,
} from '@dexa/contracts';
import { AuthProvisioningClient } from './auth-provisioning.client.js';

const OPERATION_ID = '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f';
const ACTOR_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const OPERATIONS_PATH = '/api/v1/internal/account-provisioning-operations';
const ANSWER = {
  operationId: OPERATION_ID,
  accountId: ACCOUNT_ID,
  status: AccountProvisioningStatus.ACTIVE,
};
const CREATE_REQUEST: AccountProvisioningRequest = {
  operationId: OPERATION_ID,
  actorAccountId: ACTOR_ID,
  email: 'nadia.rahma@dexa.test',
  role: 'EMPLOYEE',
  initialPassword: 'initial-pass-1',
};

// Records each call and answers with the operation shape, parsed by the schema the client passed.
function recordingClient(
  posts: InternalPostRequest<unknown>[],
  gets: InternalGetRequest<unknown>[],
): IInternalHttpClient {
  return {
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      gets.push(request);
      return Promise.resolve(request.responseSchema.parse(ANSWER));
    },
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> => {
      posts.push(request);
      return Promise.resolve(request.responseSchema.parse(ANSWER));
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
    put: () => Promise.reject(new Error('The client never puts.')),
  };
}

describe('AuthProvisioningClient', () => {
  it('should post the request to the internal provisioning route with this service token and no user token', async () => {
    const posts: InternalPostRequest<unknown>[] = [];
    const client = new AuthProvisioningClient(recordingClient(posts, []));

    await expect(client.createOperation(CREATE_REQUEST)).resolves.toEqual(ANSWER);

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: OPERATIONS_PATH,
      body: CREATE_REQUEST,
    });
    expect(posts[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should post to the activation route of the operation', async () => {
    const posts: InternalPostRequest<unknown>[] = [];
    const client = new AuthProvisioningClient(recordingClient(posts, []));

    await client.activateOperation(OPERATION_ID);

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: `${OPERATIONS_PATH}/${OPERATION_ID}/activation`,
    });
    expect(posts[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should get the operation by its ID with this service token and no user token', async () => {
    const gets: InternalGetRequest<unknown>[] = [];
    const client = new AuthProvisioningClient(recordingClient([], gets));

    await expect(client.getOperation(OPERATION_ID)).resolves.toEqual(ANSWER);

    expect(gets).toHaveLength(1);
    expect(gets[0]).toMatchObject({
      target: ServiceName.AUTH_SERVICE,
      path: `${OPERATIONS_PATH}/${OPERATION_ID}`,
    });
    expect(gets[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should reject with the dependency error when the call fails with it', async () => {
    const outage = new DependencyUnavailableError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Unavailable.');
    const httpClient: IInternalHttpClient = {
      ...recordingClient([], []),
      post: () => Promise.reject(outage),
    };
    const client = new AuthProvisioningClient(httpClient);

    await expect(client.createOperation(CREATE_REQUEST)).rejects.toBe(outage);
  });
});
