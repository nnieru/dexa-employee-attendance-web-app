import {
  ServiceName,
  type IInternalHttpClient,
  type InternalGetRequest,
  type InternalPostRequest,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  type AttendanceMonitoringPage,
  type AttendanceSummaryPage,
  type ClockInResponse,
  type ClockOutResponse,
  type TodayAttendanceResponse,
  Role,
} from '@dexa/contracts';
import { AttendanceServiceClient } from './attendance-service.client.js';

type RecordedRequest = InternalGetRequest<unknown> | InternalPostRequest<unknown>;

const USER: AuthenticatedUser = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  role: Role.EMPLOYEE,
};
const TODAY_RESPONSE: TodayAttendanceResponse = {
  businessDate: '2026-11-02',
  isWorkingDay: true,
  scheduledStartAt: '2026-11-02T02:00:00.000Z',
  scheduledEndAt: '2026-11-02T11:00:00.000Z',
  state: { status: 'NOT_CLOCKED_IN' },
};
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

const MONITORING_PAGE: AttendanceMonitoringPage = {
  items: [
    {
      accountId: '5f3c2a1e-7b4d-4c8e-9a6f-2d1b0e9c8a7f',
      employee: { name: 'Sari Lestari', positionName: 'HR Staff' },
      businessDate: '2026-11-02',
      dayStatus: 'PRESENT',
      approvedOvertimeMinutes: 0,
      rawClockInAt: '2026-11-02T02:30:00.000Z',
      rawClockOutAt: null,
      isCorrected: false,
      clockInAt: '2026-11-02T02:30:00.000Z',
      clockInStatus: 'LATE_CHECKIN',
      clockOutAt: null,
      clockOutStatus: 'PENDING_CHECKOUT',
    },
    {
      accountId: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
      employee: null,
      businessDate: '2026-11-02',
      dayStatus: 'PRESENT',
      approvedOvertimeMinutes: 90.5,
      rawClockInAt: '2026-11-02T02:05:00.000Z',
      rawClockOutAt: '2026-11-02T11:00:00.000Z',
      isCorrected: true,
      clockInAt: '2026-11-02T02:05:00.000Z',
      clockInStatus: 'ON_TIME_CHECKIN',
      clockOutAt: '2026-11-02T11:00:00.000Z',
      clockOutStatus: 'ON_TIME_CHECKOUT',
    },
  ],
  page: 1,
  pageSize: 20,
  totalItems: 2,
  totalPages: 1,
};

const SUMMARY_PAGE: AttendanceSummaryPage = {
  items: [
    {
      businessDate: '2026-11-02',
      dayStatus: 'PRESENT',
      approvedOvertimeMinutes: 0,
      clockInAt: '2026-11-02T02:30:00.000Z',
      clockInStatus: 'LATE_CHECKIN',
      clockOutAt: null,
      clockOutStatus: 'PENDING_CHECKOUT',
    },
  ],
  page: 2,
  pageSize: 5,
  totalItems: 6,
  totalPages: 2,
};

// Drops one field from a row, so a test can show the client refuses a row that lacks a required field.
function withoutField(row: object, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== field));
}

// Answers every get and post with the given response, parsed by the schema the client passes, and records the requests.
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
      return Promise.resolve(request.responseSchema.parse(response));
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
    delete: () => Promise.reject(new Error('The client never deletes.')),
  };
}

describe('AttendanceServiceClient.clockIn', () => {
  it('should post an empty body to the clock-in route on behalf of the user and no retry', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new AttendanceServiceClient(
      createRecordingHttpClient(CLOCK_IN_RESPONSE, recorded),
    );

    const response = await client.clockIn(USER);

    expect(response).toEqual(CLOCK_IN_RESPONSE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/attendance/clock-in',
      body: {},
      onBehalfOf: USER,
    });
  });
});

describe('AttendanceServiceClient.getToday', () => {
  it('should get the today route on behalf of the user and no body', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new AttendanceServiceClient(createRecordingHttpClient(TODAY_RESPONSE, recorded));

    const response = await client.getToday(USER);

    expect(response).toEqual(TODAY_RESPONSE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/attendance/me/today',
      onBehalfOf: USER,
    });
    expect(recorded[0]).not.toHaveProperty('body');
  });

  it('should reject the response when attendance-service answers a state the contract does not define', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new AttendanceServiceClient(
      createRecordingHttpClient({ ...TODAY_RESPONSE, state: { status: 'CLOCKED_OUT' } }, recorded),
    );

    await expect(client.getToday(USER)).rejects.toThrow();
  });
});

describe('AttendanceServiceClient.clockOut', () => {
  it('should post an empty body to the clock-out route on behalf of the user and no retry', async () => {
    const recorded: InternalPostRequest<unknown>[] = [];
    const client = new AttendanceServiceClient(
      createRecordingHttpClient(CLOCK_OUT_RESPONSE, recorded),
    );

    const response = await client.clockOut(USER);

    expect(response).toEqual(CLOCK_OUT_RESPONSE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/attendance/clock-out',
      body: {},
      onBehalfOf: USER,
    });
  });
});

describe('AttendanceServiceClient.listOwnSummary', () => {
  it.each([
    {
      condition: 'the range and page are given',
      query: { from: '2026-11-01', to: '2026-11-30', page: 2, pageSize: 5 },
      expectedParameters: { from: '2026-11-01', to: '2026-11-30', page: '2', pageSize: '5' },
    },
    {
      condition: 'the range is left to attendance-service',
      query: { page: 1, pageSize: 20 },
      expectedParameters: { page: '1', pageSize: '20' },
    },
    {
      condition: 'only the end of the range is given',
      query: { to: '2026-11-15', page: 1, pageSize: 20 },
      expectedParameters: { to: '2026-11-15', page: '1', pageSize: '20' },
    },
  ])(
    'should get the summary on attendance-service with the query on behalf of the user when $condition',
    async ({ query, expectedParameters }) => {
      const recorded: InternalGetRequest<unknown>[] = [];
      const client = new AttendanceServiceClient(createRecordingHttpClient(SUMMARY_PAGE, recorded));

      const response = await client.listOwnSummary(USER, query);

      expect(response).toEqual(SUMMARY_PAGE);
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({
        target: ServiceName.ATTENDANCE_SERVICE,
        path: '/api/v1/attendance/me',
        onBehalfOf: USER,
      });
      expect(recorded[0]?.query).toEqual(expectedParameters);
    },
  );

  it('should accept a request-created day with no check-in time and its stored statuses', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const page = {
      ...SUMMARY_PAGE,
      items: [
        {
          businessDate: '2026-11-07',
          dayStatus: 'DAY_OFF',
          approvedOvertimeMinutes: 60,
          clockInAt: null,
          clockInStatus: 'CHECKIN_NOT_REQUIRED',
          clockOutAt: null,
          clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
        },
      ],
    };
    const client = new AttendanceServiceClient(createRecordingHttpClient(page, recorded));

    const response = await client.listOwnSummary(USER, { page: 1, pageSize: 20 });

    expect(response).toEqual(page);
  });

  it.each([
    { condition: 'the day status is missing', field: 'dayStatus' },
    { condition: 'the approved overtime minutes are missing', field: 'approvedOvertimeMinutes' },
  ])('should reject the response when a row has no $condition', async ({ field }) => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const malformedPage = {
      ...SUMMARY_PAGE,
      items: [withoutField(SUMMARY_PAGE.items[0] ?? {}, field)],
    };
    const client = new AttendanceServiceClient(createRecordingHttpClient(malformedPage, recorded));

    await expect(client.listOwnSummary(USER, { page: 1, pageSize: 20 })).rejects.toThrow();
  });

  it('should reject the response when attendance-service answers a row the contract does not define', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const malformedPage = {
      ...SUMMARY_PAGE,
      items: [{ ...SUMMARY_PAGE.items[0], clockOutAt: null, clockOutStatus: 'ON_TIME_CHECKOUT' }],
    };
    const client = new AttendanceServiceClient(createRecordingHttpClient(malformedPage, recorded));

    await expect(client.listOwnSummary(USER, { page: 1, pageSize: 20 })).rejects.toThrow();
  });

  it('should reject the response when a row with no check-in time has a classified check-in status', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const malformedPage = {
      ...SUMMARY_PAGE,
      items: [
        {
          businessDate: '2026-11-07',
          clockInAt: null,
          clockInStatus: 'ON_TIME_CHECKIN',
          clockOutAt: null,
          clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
        },
      ],
    };
    const client = new AttendanceServiceClient(createRecordingHttpClient(malformedPage, recorded));

    await expect(client.listOwnSummary(USER, { page: 1, pageSize: 20 })).rejects.toThrow();
  });
});

describe('AttendanceServiceClient.listAttendance', () => {
  const EMPLOYEE_ACCOUNT_ID = '5f3c2a1e-7b4d-4c8e-9a6f-2d1b0e9c8a7f';

  it.each([
    {
      condition: 'every filter is given',
      query: {
        from: '2026-11-01',
        to: '2026-11-30',
        employeeId: EMPLOYEE_ACCOUNT_ID,
        page: 2,
        pageSize: 5,
      },
      expectedParameters: {
        from: '2026-11-01',
        to: '2026-11-30',
        employeeId: EMPLOYEE_ACCOUNT_ID,
        page: '2',
        pageSize: '5',
      },
    },
    {
      condition: 'no filter is given',
      query: { page: 1, pageSize: 20 },
      expectedParameters: { page: '1', pageSize: '20' },
    },
    {
      condition: 'only the employee filter is given',
      query: { employeeId: EMPLOYEE_ACCOUNT_ID, page: 1, pageSize: 20 },
      expectedParameters: { employeeId: EMPLOYEE_ACCOUNT_ID, page: '1', pageSize: '20' },
    },
  ])(
    'should get the attendance list on attendance-service with the query and the HR token when $condition',
    async ({ query, expectedParameters }) => {
      const recorded: InternalGetRequest<unknown>[] = [];
      const client = new AttendanceServiceClient(
        createRecordingHttpClient(MONITORING_PAGE, recorded),
      );

      const response = await client.listAttendance(USER, query);

      expect(response).toEqual(MONITORING_PAGE);
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({
        target: ServiceName.ATTENDANCE_SERVICE,
        path: '/api/v1/attendance',
        onBehalfOf: USER,
      });
      expect(recorded[0]?.query).toEqual(expectedParameters);
    },
  );

  it('should accept a request-created row with no check-in time and its stored statuses', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const page = {
      ...MONITORING_PAGE,
      items: [
        {
          ...MONITORING_PAGE.items[0],
          dayStatus: 'PENDING',
          rawClockInAt: null,
          rawClockOutAt: null,
          clockInAt: null,
          clockInStatus: 'PENDING_CHECKIN',
          clockOutAt: null,
          clockOutStatus: 'PENDING_CHECKOUT',
        },
      ],
    };
    const client = new AttendanceServiceClient(createRecordingHttpClient(page, recorded));

    const response = await client.listAttendance(USER, { page: 1, pageSize: 20 });

    expect(response).toEqual(page);
  });

  it.each([
    { condition: 'the day status is missing', field: 'dayStatus' },
    { condition: 'the raw clock-in is missing', field: 'rawClockInAt' },
    { condition: 'the raw clock-out is missing', field: 'rawClockOutAt' },
    { condition: 'the corrected flag is missing', field: 'isCorrected' },
    { condition: 'the approved overtime minutes are missing', field: 'approvedOvertimeMinutes' },
  ])('should reject the response when a row has no $condition', async ({ field }) => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const malformedPage = {
      ...MONITORING_PAGE,
      items: [withoutField(MONITORING_PAGE.items[0] ?? {}, field)],
    };
    const client = new AttendanceServiceClient(createRecordingHttpClient(malformedPage, recorded));

    await expect(client.listAttendance(USER, { page: 1, pageSize: 20 })).rejects.toThrow();
  });

  it('should reject the response when attendance-service answers a row without an account ID', async () => {
    const recorded: InternalGetRequest<unknown>[] = [];
    const malformedPage = {
      ...MONITORING_PAGE,
      items: [{ ...MONITORING_PAGE.items[0], accountId: undefined }],
    };
    const client = new AttendanceServiceClient(createRecordingHttpClient(malformedPage, recorded));

    await expect(client.listAttendance(USER, { page: 1, pageSize: 20 })).rejects.toThrow();
  });
});
