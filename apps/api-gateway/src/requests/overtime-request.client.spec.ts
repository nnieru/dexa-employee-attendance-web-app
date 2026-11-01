import {
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
  type InternalGetRequest,
  type InternalPostRequest,
} from '@dexa/common';
import { Role, type OvertimeRequest, type SubmitOvertimeRequest } from '@dexa/contracts';
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
