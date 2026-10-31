import {
  ServiceName,
  type IInternalHttpClient,
  type InternalBinaryGetRequest,
  type InternalGetRequest,
  type InternalMultipartPutRequest,
  type InternalPostRequest,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  ErrorCode,
  PHOTO_FIELD_NAME,
  type CreateEmployeeRequest,
  type UpdateEmployeeRequest,
  type UpdateOwnProfileRequest,
  Role,
} from '@dexa/contracts';
import { EmployeeServiceClient } from './employee-service.client.js';

const USER: AuthenticatedUser = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  role: Role.EMPLOYEE,
};
const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PHOTO_PATH = '/api/v1/employees/me/photo';

// Records each GET and fails it, so a test can inspect the request the client built. The client never
// reads the response when the call fails, so no response is needed here.
function recordingHttpClient(recorded: InternalGetRequest<unknown>[]): IInternalHttpClient {
  return {
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.reject(new Error('The recording client does not answer.'));
    },
    getBinary: () => Promise.reject(new Error('The photo tests use their own client.')),
    post: () => Promise.reject(new Error('The client never posts.')),
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
    delete: () => Promise.reject(new Error('The client never deletes.')),
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
    'should call the $route route on employee-service on behalf of the user',
    async ({ method, path }) => {
      const recorded: InternalGetRequest<unknown>[] = [];
      const client = new EmployeeServiceClient(recordingHttpClient(recorded));

      await client[method](USER).catch(() => undefined);

      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({
        target: ServiceName.EMPLOYEE_SERVICE,
        path,
        onBehalfOf: USER,
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
      getBinary: () => Promise.reject(new Error('The client never fetches bytes here.')),
      post: () => Promise.reject(new Error('The client never posts.')),
      patch: (patchRequest) => {
        recorded.push(patchRequest);
        return Promise.reject(new Error('The recording client does not answer.'));
      },
      putJson: () => Promise.reject(new Error('The client never puts JSON here.')),
      put: () => Promise.reject(new Error('The client never puts here.')),
      delete: () => Promise.reject(new Error('The client never deletes.')),
    };
    const client = new EmployeeServiceClient(httpClient);

    await client.updateOwnProfile(USER, request).catch(() => undefined);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: '/api/v1/employees/me',
      body: request,
      onBehalfOf: USER,
    });
  });
});

describe('EmployeeServiceClient.updateOwnPhoto', () => {
  it('should put the photo as the photo part on behalf of the user and no retry', async () => {
    const recorded: InternalMultipartPutRequest<unknown>[] = [];
    const httpClient: IInternalHttpClient = {
      ...rejectingHttpClient(),
      put: (putRequest) => {
        recorded.push(putRequest);
        return Promise.reject(new Error('The recording client does not answer.'));
      },
    };
    const client = new EmployeeServiceClient(httpClient);

    await client.updateOwnPhoto(USER, PHOTO_BYTES).catch(() => undefined);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      file: { fieldName: PHOTO_FIELD_NAME, content: PHOTO_BYTES },
      onBehalfOf: USER,
    });
  });
});

describe('EmployeeServiceClient.getOwnPhoto', () => {
  it('should fetch the own photo bytes on behalf of the user', async () => {
    const recorded: InternalBinaryGetRequest[] = [];
    const httpClient: IInternalHttpClient = {
      ...rejectingHttpClient(),
      getBinary: (binaryRequest) => {
        recorded.push(binaryRequest);
        return Promise.reject(new Error('The recording client does not answer.'));
      },
    };
    const client = new EmployeeServiceClient(httpClient);

    await client.getOwnPhoto(USER).catch(() => undefined);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      onBehalfOf: USER,
    });
  });
});

describe('EmployeeServiceClient.createEmployee', () => {
  it('should post the create request to the employees route on behalf of the user and no retry', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const httpClient: IInternalHttpClient = {
      ...rejectingHttpClient(),
      post: (postRequest) => {
        recorded.push(postRequest);
        return Promise.reject(new Error('The recording client does not answer.'));
      },
    };
    const client = new EmployeeServiceClient(httpClient);
    const request: CreateEmployeeRequest = {
      operationId: '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f',
      name: 'Nadia Rahma',
      email: 'nadia.rahma@dexa.test',
      positionId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
      employeeStatusId: '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f',
      phoneNumber: null,
      role: 'EMPLOYEE',
      initialPassword: 'initial-pass-1',
    };

    await client.createEmployee(USER, request).catch(() => undefined);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: '/api/v1/employees',
      body: request,
      onBehalfOf: USER,
      passThroughErrorCodes: [ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE],
    });
  });
});

// Every method rejects, so a test replaces only the method it records.
function rejectingHttpClient(): IInternalHttpClient {
  return {
    get: () => Promise.reject(new Error('The client never gets here.')),
    getBinary: () => Promise.reject(new Error('The client never fetches bytes here.')),
    post: () => Promise.reject(new Error('The client never posts.')),
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON here.')),
    put: () => Promise.reject(new Error('The client never puts here.')),
    delete: () => Promise.reject(new Error('The client never deletes.')),
  };
}

describe('EmployeeServiceClient.listEmployees', () => {
  it.each([
    {
      condition: 'a search term is given',
      query: { page: 2, pageSize: 5, q: 'kusuma' },
      expectedParameters: { page: '2', pageSize: '5', q: 'kusuma' },
    },
    {
      condition: 'no search term is given',
      query: { page: 1, pageSize: 20 },
      expectedParameters: { page: '1', pageSize: '20' },
    },
  ])(
    'should get the list on employee-service with the query on behalf of the user when $condition',
    async ({ query, expectedParameters }) => {
      const recorded: InternalGetRequest<unknown>[] = [];
      const client = new EmployeeServiceClient(recordingHttpClient(recorded));

      await client.listEmployees(USER, query).catch(() => undefined);

      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({
        target: ServiceName.EMPLOYEE_SERVICE,
        path: '/api/v1/employees',
        onBehalfOf: USER,
      });
      expect(recorded[0]?.query).toEqual(expectedParameters);
    },
  );
});

describe('EmployeeServiceClient.getEmployeePhoto', () => {
  it('should fetch the employee photo bytes with the account ID encoded and the user token forwarded', async () => {
    const recorded: InternalBinaryGetRequest[] = [];
    const httpClient: IInternalHttpClient = {
      ...rejectingHttpClient(),
      getBinary: (binaryRequest) => {
        recorded.push(binaryRequest);
        return Promise.reject(new Error('The recording client does not answer.'));
      },
    };
    const client = new EmployeeServiceClient(httpClient);

    await client
      .getEmployeePhoto(USER, '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13')
      .catch(() => undefined);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: '/api/v1/employees/5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13/photo',
      onBehalfOf: USER,
    });
  });
});

describe('EmployeeServiceClient.updateEmployee', () => {
  const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
  const REQUEST: UpdateEmployeeRequest = { name: 'Nadia Rahma', newPassword: 'reset-pass-2' };

  it('should patch the employee with the body and the HR token forwarded, with the incomplete code passed through and no retry', async () => {
    const recorded: Parameters<IInternalHttpClient['patch']>[0][] = [];
    const httpClient: IInternalHttpClient = {
      ...rejectingHttpClient(),
      patch: (patchRequest) => {
        recorded.push(patchRequest);
        return Promise.reject(new Error('The recording client does not answer.'));
      },
    };
    const client = new EmployeeServiceClient(httpClient);

    await client.updateEmployee(USER, ACCOUNT_ID, REQUEST).catch(() => undefined);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/api/v1/employees/${ACCOUNT_ID}`,
      body: REQUEST,
      onBehalfOf: USER,
      passThroughErrorCodes: [ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE],
    });
  });
});
