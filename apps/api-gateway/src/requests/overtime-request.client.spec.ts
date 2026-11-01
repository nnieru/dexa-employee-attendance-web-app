import {
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
  type InternalGetRequest,
  type InternalPostRequest,
} from '@dexa/common';
import {
  Role,
  type ApproveOvertimeRequest,
  type OvertimeRequest,
  type OvertimeRequestPage,
  type OvertimeRequestReviewPage,
  type OwnRequestListQuery,
  type RejectOvertimeRequest,
  type RequestReviewQueueQuery,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import { OvertimeRequestClient } from './overtime-request.client.js';

const USER: AuthenticatedUser = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  role: Role.EMPLOYEE,
};
const SUBMIT_REQUEST: SubmitOvertimeRequest = {
  businessDate: '2026-11-02',
  startAt: '2026-11-02T18:00:00+07:00',
  endAt: '2026-11-02T20:00:00+07:00',
  reason: 'Release deployment',
  idempotencyKey: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
};
const SAVED_REQUEST: OvertimeRequest = {
  id: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c3f',
  businessDate: '2026-11-02',
  startAt: '2026-11-02T11:00:00.000Z',
  endAt: '2026-11-02T13:00:00.000Z',
  reason: 'Release deployment',
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

const OWN_PAGE: OvertimeRequestPage = {
  items: [SAVED_REQUEST],
  page: 2,
  pageSize: 5,
  totalItems: 6,
  totalPages: 2,
};

describe('OvertimeRequestClient.listOwnRequests', () => {
  it('should get the own requests from attendance-service with the query and the user', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new OvertimeRequestClient(createRecordingGetClient(OWN_PAGE, recorded));
    const query: OwnRequestListQuery = { status: 'APPROVED', page: 2, pageSize: 5 };

    const response = await client.listOwnRequests(USER, query);

    expect(response).toEqual(OWN_PAGE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/overtime-requests/me',
      query: { status: 'APPROVED', page: '2', pageSize: '5' },
      onBehalfOf: USER,
    });
  });

  it('should omit the status from the forwarded query when the caller gave none', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new OvertimeRequestClient(createRecordingGetClient(OWN_PAGE, recorded));

    await client.listOwnRequests(USER, { page: 1, pageSize: 20 });

    expect(recorded[0]?.query).toEqual({ page: '1', pageSize: '20' });
  });

  it('should reject the page when attendance-service answers a page the contract does not define', async () => {
    const client = new OvertimeRequestClient(
      createRecordingGetClient(
        { ...OWN_PAGE, items: [{ ...SAVED_REQUEST, status: 'CANCELLED' }] },
        [],
      ),
    );

    await expect(client.listOwnRequests(USER, { page: 2, pageSize: 5 })).rejects.toThrow();
  });
});

describe('OvertimeRequestClient.submitOvertime', () => {
  it('should post the request body to attendance-service on behalf of the user', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new OvertimeRequestClient(createRecordingHttpClient(SAVED_REQUEST, recorded));

    const response = await client.submitOvertime(USER, SUBMIT_REQUEST);

    expect(response).toEqual(SAVED_REQUEST);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/overtime-requests',
      body: SUBMIT_REQUEST,
      onBehalfOf: USER,
    });
  });

  it('should reject the response when attendance-service answers a body the contract does not define', async () => {
    const client = new OvertimeRequestClient(
      createRecordingHttpClient({ ...SAVED_REQUEST, status: 'CANCELLED' }, []),
    );

    await expect(client.submitOvertime(USER, SUBMIT_REQUEST)).rejects.toThrow();
  });
});

describe('OvertimeRequestClient.listReviewQueue', () => {
  const REVIEW_PAGE: OvertimeRequestReviewPage = {
    items: [
      {
        ...SAVED_REQUEST,
        requester: { accountId: USER.accountId, name: null },
        isOwnRequest: true,
        current: { approvedMinutes: 60 },
      },
    ],
    page: 2,
    pageSize: 5,
    totalItems: 6,
    totalPages: 2,
  };

  it('should get the review queue from attendance-service with every filter and the user', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new OvertimeRequestClient(createRecordingGetClient(REVIEW_PAGE, recorded));
    const query: RequestReviewQueueQuery = {
      status: 'REJECTED',
      employeeId: USER.accountId,
      from: '2026-11-01',
      to: '2026-11-03',
      page: 2,
      pageSize: 5,
    };

    const response = await client.listReviewQueue(USER, query);

    expect(response).toEqual(REVIEW_PAGE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/overtime-requests',
      query: {
        status: 'REJECTED',
        employeeId: USER.accountId,
        from: '2026-11-01',
        to: '2026-11-03',
        page: '2',
        pageSize: '5',
      },
      onBehalfOf: USER,
    });
  });

  it('should omit the absent filters from the forwarded query', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const client = new OvertimeRequestClient(createRecordingGetClient(REVIEW_PAGE, recorded));

    await client.listReviewQueue(USER, { status: 'PENDING', page: 1, pageSize: 20 });

    expect(recorded[0]?.query).toEqual({ status: 'PENDING', page: '1', pageSize: '20' });
  });

  it('should reject the page when attendance-service answers an item without a requester', async () => {
    const itemWithoutRequester = { ...REVIEW_PAGE.items[0], requester: undefined };
    const client = new OvertimeRequestClient(
      createRecordingGetClient({ ...REVIEW_PAGE, items: [itemWithoutRequester] }, []),
    );

    await expect(
      client.listReviewQueue(USER, { status: 'PENDING', page: 1, pageSize: 20 }),
    ).rejects.toThrow();
  });
});

const REQUEST_ID = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';
const REVIEWER: AuthenticatedUser = {
  accountId: '9d2b6a1e-3c4f-4a8b-8e7d-1f2a3b4c5d6e',
  role: Role.HR,
};
const DECIDED_REQUEST: OvertimeRequest = {
  ...SAVED_REQUEST,
  status: 'REJECTED',
  reviewReason: 'Overlaps the release window',
  reviewedAt: '2026-11-06T04:00:00.000Z',
};

describe('OvertimeRequestClient.approveOvertime', () => {
  it('should post the optional reason to the approve path on behalf of the reviewer', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new OvertimeRequestClient(
      createRecordingHttpClient({ ...SAVED_REQUEST, status: 'APPROVED' }, recorded),
    );
    const body: ApproveOvertimeRequest = { reviewReason: 'Confirmed' };

    const response = await client.approveOvertime(REVIEWER, REQUEST_ID, body);

    expect(response).toMatchObject({ status: 'APPROVED' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `/api/v1/overtime-requests/${REQUEST_ID}/approve`,
      body: { reviewReason: 'Confirmed' },
      onBehalfOf: REVIEWER,
    });
  });

  it('should reject the answer when attendance-service answers a status the contract does not define', async () => {
    const client = new OvertimeRequestClient(
      createRecordingHttpClient({ ...SAVED_REQUEST, status: 'CANCELLED' }, []),
    );

    await expect(client.approveOvertime(REVIEWER, REQUEST_ID, {})).rejects.toThrow();
  });
});

describe('OvertimeRequestClient.rejectOvertime', () => {
  it('should post the reason to the reject path on behalf of the reviewer and answer the rejected request', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new OvertimeRequestClient(createRecordingHttpClient(DECIDED_REQUEST, recorded));
    const body: RejectOvertimeRequest = { reviewReason: 'Overlaps the release window' };

    const response = await client.rejectOvertime(REVIEWER, REQUEST_ID, body);

    expect(response).toEqual(DECIDED_REQUEST);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `/api/v1/overtime-requests/${REQUEST_ID}/reject`,
      body: { reviewReason: 'Overlaps the release window' },
      onBehalfOf: REVIEWER,
    });
  });
});
