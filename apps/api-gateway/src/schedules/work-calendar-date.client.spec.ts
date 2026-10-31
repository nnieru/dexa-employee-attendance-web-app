import {
  ServiceName,
  type IInternalHttpClient,
  type InternalDeleteRequest,
  type InternalGetRequest,
  type InternalJsonPutRequest,
  type AuthenticatedUser,
} from '@dexa/common';
import { type WorkCalendarDate, type WorkCalendarDatePage, Role } from '@dexa/contracts';
import { WorkCalendarDateClient } from './work-calendar-date.client.js';

type RecordedRequest =
  InternalGetRequest<unknown> | InternalJsonPutRequest<unknown> | InternalDeleteRequest<unknown>;

const USER: AuthenticatedUser = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  role: Role.EMPLOYEE,
};
const HOLIDAY: WorkCalendarDate = {
  date: '2026-11-09',
  isWorkingDay: false,
  description: 'Public holiday',
};
const DATE_PAGE: WorkCalendarDatePage = {
  items: [HOLIDAY],
  page: 2,
  pageSize: 10,
  totalItems: 11,
  totalPages: 2,
};

// Answers every get and put with the given response, parsed by the schema the client passes, and records the requests.
function createRecordingHttpClient(
  response: unknown,
  recorded: RecordedRequest[],
): IInternalHttpClient {
  return {
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve().then(() => request.responseSchema.parse(response));
    },
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: () => Promise.reject(new Error('The client never posts.')),
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: <TResponse>(request: InternalJsonPutRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve().then(() => request.responseSchema.parse(response));
    },
    put: () => Promise.reject(new Error('The client never puts.')),
    delete: <TResponse>(request: InternalDeleteRequest<TResponse>): Promise<TResponse> => {
      recorded.push(request);
      return Promise.resolve().then(() => request.responseSchema.parse(response));
    },
  };
}

describe('WorkCalendarDateClient.listDates', () => {
  it('should get the calendar dates route with the range and page forwarded and on behalf of the user', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkCalendarDateClient(createRecordingHttpClient(DATE_PAGE, recorded));

    const response = await client.listDates(USER, {
      from: '2026-11-01',
      to: '2026-11-30',
      page: 2,
      pageSize: 10,
    });

    expect(response).toEqual(DATE_PAGE);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/work-calendar-dates',
      query: { from: '2026-11-01', to: '2026-11-30', page: '2', pageSize: '10' },
      onBehalfOf: USER,
    });
    expect(recorded[0]).not.toHaveProperty('body');
  });

  it('should reject the response when attendance-service answers a page the contract does not define', async () => {
    const client = new WorkCalendarDateClient(
      createRecordingHttpClient({ ...DATE_PAGE, items: [{ ...HOLIDAY, date: '9 Nov' }] }, []),
    );

    await expect(
      client.listDates(USER, { from: '2026-11-01', to: '2026-11-30', page: 1, pageSize: 20 }),
    ).rejects.toThrow();
  });
});

describe('WorkCalendarDateClient.upsertDate', () => {
  it('should put the request to the date route on behalf of the user and no retry', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkCalendarDateClient(createRecordingHttpClient(HOLIDAY, recorded));

    const response = await client.upsertDate(USER, '2026-11-09', {
      isWorkingDay: false,
      description: 'Public holiday',
    });

    expect(response).toEqual(HOLIDAY);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/work-calendar-dates/2026-11-09',
      body: { isWorkingDay: false, description: 'Public holiday' },
      onBehalfOf: USER,
    });
  });

  it('should encode the date in the route so it cannot change the path', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkCalendarDateClient(createRecordingHttpClient(HOLIDAY, recorded));

    await client.upsertDate(USER, '../attendance/x', { isWorkingDay: true });

    expect(recorded[0]).toMatchObject({ path: '/api/v1/work-calendar-dates/..%2Fattendance%2Fx' });
  });

  it('should reject the response when attendance-service answers a date the contract does not define', async () => {
    const client = new WorkCalendarDateClient(
      createRecordingHttpClient({ ...HOLIDAY, isWorkingDay: 'no' }, []),
    );

    await expect(client.upsertDate(USER, '2026-11-09', { isWorkingDay: false })).rejects.toThrow();
  });
});

describe('WorkCalendarDateClient.deleteDate', () => {
  it('should delete the date route on behalf of the user and no retry', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkCalendarDateClient(createRecordingHttpClient(undefined, recorded));

    await expect(client.deleteDate(USER, '2026-11-09')).resolves.toBeUndefined();

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: '/api/v1/work-calendar-dates/2026-11-09',
      onBehalfOf: USER,
    });
    expect(recorded[0]).not.toHaveProperty('body');
  });

  it('should encode the date in the route so it cannot change the path', async () => {
    const recorded: RecordedRequest[] = [];
    const client = new WorkCalendarDateClient(createRecordingHttpClient(undefined, recorded));

    await client.deleteDate(USER, '../attendance/x');

    expect(recorded[0]).toMatchObject({ path: '/api/v1/work-calendar-dates/..%2Fattendance%2Fx' });
  });

  it('should reject the call when attendance-service answers a body where the delete has none', async () => {
    const client = new WorkCalendarDateClient(createRecordingHttpClient({ removed: true }, []));

    await expect(client.deleteDate(USER, '2026-11-09')).rejects.toThrow();
  });
});
