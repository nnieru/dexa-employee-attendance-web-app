import { ErrorCode } from '@dexa/contracts';
import { DependencyUnavailableError, NotFoundError } from '../errors/domain.errors.js';
import type {
  IInternalHttpClient,
  InternalGetRequest,
} from '../http/internal-http-client.interface.js';
import { AuthServiceAccountStatusReader } from './auth-service-account-status.reader.js';
import { ServiceName } from './service-name.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const STATUS_PATH = `/api/v1/internal/accounts/${ACCOUNT_ID}/status`;

// Records each GET and answers with the outcome the test chose. Only GET is used by the reader.
function recordingHttpClient(outcome: () => Promise<unknown>): {
  readonly client: IInternalHttpClient;
  readonly requests: InternalGetRequest<unknown>[];
} {
  const requests: InternalGetRequest<unknown>[] = [];
  const client: IInternalHttpClient = {
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      requests.push(request);
      return outcome() as Promise<TResponse>;
    },
    getBinary: () => Promise.reject(new Error('The reader must not fetch bytes.')),
    post: () => Promise.reject(new Error('The reader must not POST.')),
    patch: () => Promise.reject(new Error('The reader must not PATCH.')),
    put: () => Promise.reject(new Error('The reader must not PUT.')),
  };
  return { client, requests };
}

describe('AuthServiceAccountStatusReader', () => {
  it('should return the status that auth-service answers for the account', async () => {
    const { client, requests } = recordingHttpClient(() => Promise.resolve({ isActive: false }));

    const status = await new AuthServiceAccountStatusReader(client).findAccountStatus(ACCOUNT_ID);

    expect(status).toEqual({ isActive: false });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ target: ServiceName.AUTH_SERVICE, path: STATUS_PATH });
  });

  it('should call auth-service with this service token, never a forwarded user token', async () => {
    const { client, requests } = recordingHttpClient(() => Promise.resolve({ isActive: true }));

    await new AuthServiceAccountStatusReader(client).findAccountStatus(ACCOUNT_ID);

    expect(requests[0]?.forwardedUserToken).toBeUndefined();
  });

  it('should encode the account ID as one path segment', async () => {
    const { client, requests } = recordingHttpClient(() => Promise.resolve({ isActive: true }));

    await new AuthServiceAccountStatusReader(client).findAccountStatus('../accounts?x=1');

    expect(requests[0]?.path).toBe(
      `/api/v1/internal/accounts/${encodeURIComponent('../accounts?x=1')}/status`,
    );
  });

  it('should resolve undefined when auth-service answers that the account does not exist', async () => {
    const { client } = recordingHttpClient(() =>
      Promise.reject(new NotFoundError(ErrorCode.NOT_FOUND, 'Account not found.')),
    );

    await expect(
      new AuthServiceAccountStatusReader(client).findAccountStatus(ACCOUNT_ID),
    ).resolves.toBeUndefined();
  });

  it('should propagate the error when auth-service cannot be reached, so the request is refused', async () => {
    const outage = new DependencyUnavailableError(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      'A dependent service is unavailable. Try again shortly.',
    );
    const { client } = recordingHttpClient(() => Promise.reject(outage));

    await expect(
      new AuthServiceAccountStatusReader(client).findAccountStatus(ACCOUNT_ID),
    ).rejects.toBe(outage);
  });
});
