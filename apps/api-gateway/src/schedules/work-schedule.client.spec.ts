import {
  ServiceName,
  type IInternalHttpClient,
  type InternalGetRequest,
  type InternalJsonPutRequest,
  type InternalPostRequest,
} from '@dexa/common';
import {
  ErrorCode,
  type WorkScheduleOverview,
  type WorkScheduleVersion,
  type WorkScheduleVersionRequest,
} from '@dexa/contracts';
import { WorkScheduleClient } from './work-schedule.client.js';

type RecordedRequest =
  InternalGetRequest<unknown> | InternalPostRequest<unknown> | InternalJsonPutRequest<unknown>;

const USER_TOKEN = 'user-access-token';
const OVERVIEW: WorkScheduleOverview = {
  current: {
    id: '5f3c2a1e-7b4d-4c8e-9a6f-2d1b0e9c8a7f',
    name: 'Default company schedule',
    timezone: 'Asia/Jakarta',
    workingWeekdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '18:00',
    lateCheckinGraceMinutes: 15,
    earlyCheckoutGraceMinutes: 0,
    lateCheckoutGraceMinutes: 0,
    effectiveFrom: '2026-11-02',
    effectiveUntil: '2026-11-16',
  },
  upcoming: {
    id: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
    name: 'Shortened company schedule',
    timezone: 'Asia/Jakarta',
    workingWeekdays: [1, 3, 5],
    startTime: '08:30',
    endTime: '17:30',
    lateCheckinGraceMinutes: 10,
    earlyCheckoutGraceMinutes: 5,
    lateCheckoutGraceMinutes: 20,
    effectiveFrom: '2026-11-16',
    effectiveUntil: null,
  },
};

// Answers every get with the given response, parsed by the schema the client passes, and records the requests.
function createRecordingHttpClient(
  response: unknown,
  recorded: RecordedRequest[],
): IInternalHttpClient {
  return {
    // The parse runs inside a promise chain, so a schema refusal rejects the call as the real client does.
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve().then(() => request.responseSchema.parse(response));
    },
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve().then(() => request.responseSchema.parse(response));
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: <TResponse>(request: InternalJsonPutRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve().then(() => request.responseSchema.parse(response));
    },
    put: () => Promise.reject(new Error('The client never puts.')),
  };
}

const VERSION_REQUEST: WorkScheduleVersionRequest = {
  workingWeekdays: [1, 3, 5],
  startTime: '08:30',
  endTime: '17:30',
  lateCheckinGraceMinutes: 10,
  earlyCheckoutGraceMinutes: 5,
  lateCheckoutGraceMinutes: 20,
  effectiveFrom: '2026-11-16',
};
const SAVED_VERSION: WorkScheduleVersion = {
  id: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
  name: 'Shortened company schedule',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 3, 5],
  startTime: '08:30',
  endTime: '17:30',
  lateCheckinGraceMinutes: 10,
  earlyCheckoutGraceMinutes: 5,
  lateCheckoutGraceMinutes: 20,
  effectiveFrom: '2026-11-16',
  effectiveUntil: null,
};
const VERSION_ID = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';

describe('WorkScheduleClient.getScheduleOverview', () => {
  it('should get the work schedules route on attendance-service with the user token forwarded and no retry', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkScheduleClient(createRecordingHttpClient(OVERVIEW, recorded));

    const response = await client.getScheduleOverview(USER_TOKEN);

    expect(response).toEqual(OVERVIEW);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/work-schedules',
      forwardedUserToken: USER_TOKEN,
      refusalCodes: [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED],
    });
    expect(recorded[0]).not.toHaveProperty('body');
    expect(recorded[0]).not.toHaveProperty('query');
  });

  it('should reject the response when attendance-service answers a schedule the contract does not define', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkScheduleClient(
      createRecordingHttpClient({ current: { ...OVERVIEW.current, startTime: '9am' } }, recorded),
    );

    await expect(client.getScheduleOverview(USER_TOKEN)).rejects.toThrow();
  });
});

describe('WorkScheduleClient.createVersion', () => {
  it('should post the version request to the work schedules route with the user token forwarded and no retry', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkScheduleClient(createRecordingHttpClient(SAVED_VERSION, recorded));

    const response = await client.createVersion(USER_TOKEN, VERSION_REQUEST);

    expect(response).toEqual(SAVED_VERSION);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/work-schedules',
      body: VERSION_REQUEST,
      forwardedUserToken: USER_TOKEN,
      refusalCodes: [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED],
    });
  });

  it('should reject the response when attendance-service answers a version the contract does not define', async () => {
    const client = new WorkScheduleClient(
      createRecordingHttpClient({ ...SAVED_VERSION, startTime: '9am' }, []),
    );

    await expect(client.createVersion(USER_TOKEN, VERSION_REQUEST)).rejects.toThrow();
  });
});

describe('WorkScheduleClient.updateVersion', () => {
  it('should put the version request to the version route with the user token forwarded and no retry', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkScheduleClient(createRecordingHttpClient(SAVED_VERSION, recorded));

    const response = await client.updateVersion(USER_TOKEN, VERSION_ID, VERSION_REQUEST);

    expect(response).toEqual(SAVED_VERSION);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `/api/v1/work-schedules/${VERSION_ID}`,
      body: VERSION_REQUEST,
      forwardedUserToken: USER_TOKEN,
      refusalCodes: [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED],
    });
  });

  it('should encode the version id in the route so it cannot change the path', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkScheduleClient(createRecordingHttpClient(SAVED_VERSION, recorded));

    await client.updateVersion(USER_TOKEN, '../attendance/x', VERSION_REQUEST);

    expect(recorded[0]).toMatchObject({
      path: '/api/v1/work-schedules/..%2Fattendance%2Fx',
    });
  });
});
