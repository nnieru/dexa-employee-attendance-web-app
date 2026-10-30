import { ServiceName, type IInternalHttpClient, type InternalPostRequest } from '@dexa/common';
import { ErrorCode, type ClockInResponse, type ClockOutResponse } from '@dexa/contracts';
import { AttendanceServiceClient } from './attendance-service.client.js';

const USER_TOKEN = 'user-access-token';
const CLOCK_IN_RESPONSE: ClockInResponse = {
  type: 'IN',
  recordedAt: '2026-11-02T02:20:00.000Z',
  businessDate: '2026-11-02',
  classification: 'LATE_CHECKIN',
};
const CLOCK_OUT_RESPONSE: ClockOutResponse = {
  type: 'OUT',
  recordedAt: '2026-11-02T11:00:00.000Z',
  businessDate: '2026-11-02',
  classification: 'ON_TIME_CHECKOUT',
};

// Answers every post with the given response, parsed by the schema the client passes, and records the requests.
function createRecordingHttpClient(
  response: unknown,
  recorded: InternalPostRequest<unknown>[],
): IInternalHttpClient {
  return {
    get: () => Promise.reject(new Error('The client never gets.')),
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve(request.responseSchema.parse(response));
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
  };
}

describe('AttendanceServiceClient.clockIn', () => {
  it('should post an empty body to the clock-in route with the user token forwarded and no retry', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new AttendanceServiceClient(
      createRecordingHttpClient(CLOCK_IN_RESPONSE, recorded),
    );

    const response = await client.clockIn(USER_TOKEN);

    expect(response).toEqual(CLOCK_IN_RESPONSE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/attendance/clock-in',
      body: {},
      forwardedUserToken: USER_TOKEN,
      refusalCodes: [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED],
    });
  });
});

describe('AttendanceServiceClient.clockOut', () => {
  it('should post an empty body to the clock-out route with the user token forwarded and no retry', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new AttendanceServiceClient(
      createRecordingHttpClient(CLOCK_OUT_RESPONSE, recorded),
    );

    const response = await client.clockOut(USER_TOKEN);

    expect(response).toEqual(CLOCK_OUT_RESPONSE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/attendance/clock-out',
      body: {},
      forwardedUserToken: USER_TOKEN,
      refusalCodes: [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED],
    });
  });
});
