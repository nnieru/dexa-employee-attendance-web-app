import {
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
  type InternalGetRequest,
  type InternalPostRequest,
} from '@dexa/common';
import {
  Role,
  type CorrectionRequest,
  type CorrectionRequestPage,
  type CorrectionRequestReviewPage,
  type OwnRequestListQuery,
  type RequestReviewQueueQuery,
  type SubmitCorrectionRequest,
} from '@dexa/contracts';
import { CorrectionRequestClient } from './correction-request.client.js';

const USER: AuthenticatedUser = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  role: Role.EMPLOYEE,
};
const SUBMIT_REQUEST: SubmitCorrectionRequest = {
  requestedDayStatus: 'PRESENT',
  businessDate: '2026-11-02',
  clockInAt: '2026-11-02T09:05:00+07:00',
  clockOutAt: '2026-11-02T18:00:00+07:00',
  reason: 'Forgot to clock in',
  idempotencyKey: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
};
const SAVED_REQUEST: CorrectionRequest = {
  id: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c3f',
  businessDate: '2026-11-02',
  requestedDayStatus: 'PRESENT',
  clockInAt: '2026-11-02T02:05:00.000Z',
  clockOutAt: '2026-11-02T11:00:00.000Z',
  reason: 'Forgot to clock in',
  status: 'PENDING',
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-11-02T10:00:00.000Z',
};

// Answers the one post with the given response, parsed by the schema the client passes, and records the request.
function createRecordingHttpClient(
  response: unknown,
  recorded: InternalPostRequest<unknown>[],
): IInternalHttpClient {
  return {
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> =>
      Promise.reject(new Error(`The client never gets ${request.path}.`)),
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve().then(() => request.responseSchema.parse(response));
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
    delete: () => Promise.reject(new Error('The client never deletes.')),
  };
}

// Answers the one get with the given response, parsed by the schema the client passes, and records the request.
function createRecordingGetClient(
  response: unknown,
  recorded: InternalGetRequest<unknown>[],
): IInternalHttpClient {
  return {
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve().then(() => request.responseSchema.parse(response));
    },
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> =>
      Promise.reject(new Error(`The client never posts ${request.path}.`)),
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
    delete: () => Promise.reject(new Error('The client never deletes.')),
  };
}

const OWN_PAGE: CorrectionRequestPage = {
  items: [SAVED_REQUEST],
  page: 2,
  pageSize: 5,
  totalItems: 6,
  totalPages: 2,
};

describe('CorrectionRequestClient.listOwnRequests', () => {
  it('should get the own requests from attendance-service with the query and the user', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new CorrectionRequestClient(createRecordingGetClient(OWN_PAGE, recorded));
    const query: OwnRequestListQuery = { status: 'APPROVED', page: 2, pageSize: 5 };

    const response = await client.listOwnRequests(USER, query);

    expect(response).toEqual(OWN_PAGE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/attendance-corrections/me',
      query: { status: 'APPROVED', page: '2', pageSize: '5' },
      onBehalfOf: USER,
    });
  });

  it('should omit the status from the forwarded query when the caller gave none', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new CorrectionRequestClient(createRecordingGetClient(OWN_PAGE, recorded));

    await client.listOwnRequests(USER, { page: 1, pageSize: 20 });

    expect(recorded[0]?.query).toEqual({ page: '1', pageSize: '20' });
  });

  it('should reject the page when attendance-service answers a page the contract does not define', async () => {
    const client = new CorrectionRequestClient(
      createRecordingGetClient(
        { ...OWN_PAGE, items: [{ ...SAVED_REQUEST, status: 'CANCELLED' }] },
        [],
      ),
    );

    await expect(client.listOwnRequests(USER, { page: 2, pageSize: 5 })).rejects.toThrow();
  });
});

describe('CorrectionRequestClient.submitCorrection', () => {
  it('should post the request body to attendance-service on behalf of the user', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new CorrectionRequestClient(createRecordingHttpClient(SAVED_REQUEST, recorded));

    const response = await client.submitCorrection(USER, SUBMIT_REQUEST);

    expect(response).toEqual(SAVED_REQUEST);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/attendance-corrections',
      body: SUBMIT_REQUEST,
      onBehalfOf: USER,
    });
  });

  it('should reject the response when attendance-service answers a body the contract does not define', async () => {
    const client = new CorrectionRequestClient(
      createRecordingHttpClient({ ...SAVED_REQUEST, status: 'CANCELLED' }, []),
    );

    await expect(client.submitCorrection(USER, SUBMIT_REQUEST)).rejects.toThrow();
  });
});

describe('CorrectionRequestClient.listReviewQueue', () => {
  const REVIEW_PAGE: CorrectionRequestReviewPage = {
    items: [
      {
        ...SAVED_REQUEST,
        requester: { accountId: USER.accountId, name: 'Rama Putra' },
        isOwnRequest: false,
        current: { clockInAt: null, clockOutAt: null, dayStatus: 'PENDING' },
      },
    ],
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  };

  it('should get the review queue from attendance-service with every filter and the user', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new CorrectionRequestClient(createRecordingGetClient(REVIEW_PAGE, recorded));
    const query: RequestReviewQueueQuery = {
      status: 'APPROVED',
      employeeId: USER.accountId,
      from: '2026-11-01',
      to: '2026-11-03',
      page: 3,
      pageSize: 10,
    };

    const response = await client.listReviewQueue(USER, query);

    expect(response).toEqual(REVIEW_PAGE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/attendance-corrections',
      query: {
        status: 'APPROVED',
        employeeId: USER.accountId,
        from: '2026-11-01',
        to: '2026-11-03',
        page: '3',
        pageSize: '10',
      },
      onBehalfOf: USER,
    });
  });

  it('should omit the absent filters from the forwarded query', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new CorrectionRequestClient(createRecordingGetClient(REVIEW_PAGE, recorded));

    await client.listReviewQueue(USER, { status: 'PENDING', page: 1, pageSize: 20 });

    expect(recorded[0]?.query).toEqual({ status: 'PENDING', page: '1', pageSize: '20' });
  });

  it('should reject the page when attendance-service answers a day status the contract does not define', async () => {
    const client = new CorrectionRequestClient(
      createRecordingGetClient(
        {
          ...REVIEW_PAGE,
          items: [
            {
              ...REVIEW_PAGE.items[0],
              current: { clockInAt: null, clockOutAt: null, dayStatus: 'PENDING_CHECKIN' },
            },
          ],
        },
        [],
      ),
    );

    await expect(
      client.listReviewQueue(USER, { status: 'PENDING', page: 1, pageSize: 20 }),
    ).rejects.toThrow();
  });
});
