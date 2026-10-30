import { ServiceName, type IInternalHttpClient, type InternalGetRequest } from '@dexa/common';
import { ErrorCode, type UpdateOwnProfileRequest } from '@dexa/contracts';
import { EmployeeServiceClient } from './employee-service.client.js';

const USER_TOKEN = 'user-access-token';

// Records each GET and fails it, so a test can inspect the request the client built. The client never
// reads the response when the call fails, so no response is needed here.
function recordingHttpClient(recorded: InternalGetRequest<unknown>[]): IInternalHttpClient {
  return {
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.reject(new Error('The recording client does not answer.'));
    },
    post: () => Promise.reject(new Error('The client never posts.')),
    patch: () => Promise.reject(new Error('The client never patches.')),
  };
}

describe('EmployeeServiceClient', () => {
  it.each([
    { route: 'positions', method: 'listPositions', path: '/api/v1/positions' },
    {
      route: 'employee statuses',
      method: 'listEmployeeStatuses',
      path: '/api/v1/employee-statuses',
    },
    { route: 'own profile', method: 'getOwnProfile', path: '/api/v1/employees/me' },
  ] as const)(
    'should call the $route route on employee-service with the user token forwarded',
    async ({ method, path }) => {
      const recorded: InternalGetRequest<unknown>[] = [];
      const client = new EmployeeServiceClient(recordingHttpClient(recorded));

      await client[method](USER_TOKEN).catch(() => undefined);

      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({
        target: ServiceName.EMPLOYEE_SERVICE,
        path,
        forwardedUserToken: USER_TOKEN,
        refusalCodes: [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED],
      });
    },
  );
});

describe('EmployeeServiceClient.updateOwnProfile', () => {
  it('should patch the own profile with the body and the user token forwarded', async () => {
    const recorded: Parameters<IInternalHttpClient['patch']>[0][] = [];
    const request: UpdateOwnProfileRequest = { phoneNumber: '+6281234567890' };
    const httpClient: IInternalHttpClient = {
      get: () => Promise.reject(new Error('The client never gets here.')),
      post: () => Promise.reject(new Error('The client never posts.')),
      patch: (patchRequest) => {
        recorded.push(patchRequest);
        return Promise.reject(new Error('The recording client does not answer.'));
      },
    };
    const client = new EmployeeServiceClient(httpClient);

    await client.updateOwnProfile(USER_TOKEN, request).catch(() => undefined);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: '/api/v1/employees/me',
      body: request,
      forwardedUserToken: USER_TOKEN,
      refusalCodes: [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED],
    });
  });
});
