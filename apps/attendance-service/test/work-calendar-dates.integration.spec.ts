import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, type IClock, ServiceName } from '@dexa/common';
import { Role, workCalendarDatePageSchema, workCalendarDateSchema } from '@dexa/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import type { AuthKeySet } from './auth-key-set.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

// The lifetime of the token api-gateway sends for a call (D-51).
const TOKEN_LIFETIME_SECONDS = 60;

const CALENDAR_DATES_PATH = '/api/v1/work-calendar-dates';
const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
// The default schedule is seeded from the first start, so it takes effect on Monday 2 Nov (WIB).
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
// 2 Nov is today in the business timezone, so only 3 Nov and later can change.
const TODAY = '2026-11-02';
const TUESDAY_OFFICE_CLOSED = '2026-11-03';
const NEXT_MONDAY = '2026-11-09';
const WORKING_SATURDAY = '2026-11-21';
const PAST_DATE = '2026-10-30';
// The Sunday before next Monday, at 10:00 WIB.
const SUNDAY_BEFORE_NEXT_MONDAY_INSTANT = new Date('2026-11-08T03:00:00Z');
// 09:20 WIB on the given Monday, after the 09:15 late check-in limit of the default schedule.
const NEXT_MONDAY_LATE_PUNCH_INSTANT = new Date('2026-11-09T02:20:00Z');
const MONDAY_AFTER_PUNCH_CONTROL = '2026-11-16';
const MONDAY_AFTER_PUNCH_CONTROL_INSTANT = new Date('2026-11-16T02:20:00Z');

// Stands in for auth-service. The clock is shared across tests, so each test sets the instant it needs.
const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

let container: StartedPostgreSqlContainer;
let keys: AuthKeySet;

// Signs the token that api-gateway sends to this service for the user (D-51).
function signUserToken(accountId: string, role: Role, expiresAtSeconds: number): string {
  return signGatewayUserToken(
    keys,
    ServiceName.ATTENDANCE_SERVICE,
    accountId,
    role,
    expiresAtSeconds,
  );
}

function tokenFor(accountId: string, role: Role): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signUserToken(accountId, role, expiresAt);
}

function registerAccount(): string {
  const accountId = randomUUID();
  return accountId;
}

async function startApp(databaseUrl: string): Promise<INestApplication> {
  const config = parseConfig(
    AttendanceServiceConfigSchema,
    attendanceServiceEnvironment({ ATTENDANCE_DATABASE_URL: databaseUrl }),
  );
  const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
    .overrideProvider(CLOCK)
    .useValue(fixedClock)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, { CORS_ORIGINS: [] });
  await app.init();
  return app;
}

function listCalendarDates(
  app: INestApplication,
  accessToken: string,
  query: Record<string, string | number>,
) {
  return request(app.getHttpServer())
    .get(CALENDAR_DATES_PATH)
    .query(query)
    .set('Authorization', `Bearer ${accessToken}`);
}

function putCalendarDate(app: INestApplication, accessToken: string, date: string, body: unknown) {
  return request(app.getHttpServer())
    .put(`${CALENDAR_DATES_PATH}/${date}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body as object);
}

function deleteCalendarDate(app: INestApplication, accessToken: string, date: string) {
  return request(app.getHttpServer())
    .delete(`${CALENDAR_DATES_PATH}/${date}`)
    .set('Authorization', `Bearer ${accessToken}`);
}

function postClockIn(app: INestApplication, accessToken: string) {
  return request(app.getHttpServer())
    .post(CLOCK_IN_PATH)
    .set('Authorization', `Bearer ${accessToken}`);
}

const OFFICE_CLOSED_REQUEST = { isWorkingDay: false, description: 'Office closed' };

describe('work calendar dates', () => {
  let hrAccountId: string;
  let employeeAccountId: string;

  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    container = await new PostgreSqlContainer('postgres:18').start();
    hrAccountId = registerAccount();
    employeeAccountId = registerAccount();
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(() => {
    mutableClock.current = FIRST_START_INSTANT;
  });

  describe('when HR lists a range of exceptions', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await startApp(await createEmptyDatabaseUri(container.getConnectionUri()));
      const hrToken = tokenFor(hrAccountId, Role.HR);
      await putCalendarDate(app, hrToken, NEXT_MONDAY, {
        isWorkingDay: false,
        description: 'Public holiday',
      }).expect(200);
      await putCalendarDate(app, hrToken, WORKING_SATURDAY, {
        isWorkingDay: true,
        description: 'Working Saturday',
      }).expect(200);
      await putCalendarDate(app, hrToken, TUESDAY_OFFICE_CLOSED, OFFICE_CLOSED_REQUEST).expect(200);
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      await app?.close();
    }, CONTAINER_TIMEOUT_MS);

    it(
      'should return the exceptions in the range in date order with the page counts when HR asks',
      async () => {
        const response = await listCalendarDates(app, tokenFor(hrAccountId, Role.HR), {
          from: '2026-11-01',
          to: '2026-11-30',
          page: 1,
          pageSize: 20,
        }).expect(200);

        expect(workCalendarDatePageSchema.parse(response.body)).toEqual({
          items: [
            { date: TUESDAY_OFFICE_CLOSED, isWorkingDay: false, description: 'Office closed' },
            { date: NEXT_MONDAY, isWorkingDay: false, description: 'Public holiday' },
            { date: WORKING_SATURDAY, isWorkingDay: true, description: 'Working Saturday' },
          ],
          page: 1,
          pageSize: 20,
          totalItems: 3,
          totalPages: 1,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return only the exceptions inside the range when the range is narrower',
      async () => {
        const response = await listCalendarDates(app, tokenFor(hrAccountId, Role.HR), {
          from: '2026-11-04',
          to: '2026-11-10',
        }).expect(200);

        const page = workCalendarDatePageSchema.parse(response.body);
        expect(page.items.map((item) => item.date)).toEqual([NEXT_MONDAY]);
        expect(page.totalItems).toBe(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return one page at a time when the page size is smaller than the count',
      async () => {
        const token = tokenFor(hrAccountId, Role.HR);
        const range = { from: '2026-11-01', to: '2026-11-30', pageSize: 2 };

        const firstPage = workCalendarDatePageSchema.parse(
          (await listCalendarDates(app, token, { ...range, page: 1 }).expect(200)).body,
        );
        const secondPage = workCalendarDatePageSchema.parse(
          (await listCalendarDates(app, token, { ...range, page: 2 }).expect(200)).body,
        );

        expect(firstPage.items.map((item) => item.date)).toEqual([
          TUESDAY_OFFICE_CLOSED,
          NEXT_MONDAY,
        ]);
        expect(secondPage.items.map((item) => item.date)).toEqual([WORKING_SATURDAY]);
        expect(secondPage).toMatchObject({ page: 2, totalItems: 3, totalPages: 2 });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return an empty page when the range has no exception',
      async () => {
        const response = await listCalendarDates(app, tokenFor(hrAccountId, Role.HR), {
          from: '2027-01-01',
          to: '2027-01-31',
        }).expect(200);

        expect(workCalendarDatePageSchema.parse(response.body)).toMatchObject({
          items: [],
          totalItems: 0,
          totalPages: 0,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse the list with 400 when from is missing',
      async () => {
        const response = await listCalendarDates(app, tokenFor(hrAccountId, Role.HR), {
          to: '2026-11-30',
        }).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse the list with 400 when from is after to',
      async () => {
        const response = await listCalendarDates(app, tokenFor(hrAccountId, Role.HR), {
          from: '2026-11-30',
          to: '2026-11-01',
        }).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('when HR saves an exception for a future date', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await startApp(await createEmptyDatabaseUri(container.getConnectionUri()));
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      await app?.close();
    }, CONTAINER_TIMEOUT_MS);

    it(
      'should create the exception and answer 200 with the stored date when the date has none',
      async () => {
        const response = await putCalendarDate(
          app,
          tokenFor(hrAccountId, Role.HR),
          TUESDAY_OFFICE_CLOSED,
          OFFICE_CLOSED_REQUEST,
        ).expect(200);

        expect(workCalendarDateSchema.parse(response.body)).toEqual({
          date: TUESDAY_OFFICE_CLOSED,
          isWorkingDay: false,
          description: 'Office closed',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should replace the exception for the date and keep one row when HR saves the date again',
      async () => {
        const token = tokenFor(hrAccountId, Role.HR);
        await putCalendarDate(app, token, NEXT_MONDAY, OFFICE_CLOSED_REQUEST).expect(200);

        const response = await putCalendarDate(app, token, NEXT_MONDAY, {
          isWorkingDay: true,
          description: 'Company event day',
        }).expect(200);

        expect(workCalendarDateSchema.parse(response.body)).toEqual({
          date: NEXT_MONDAY,
          isWorkingDay: true,
          description: 'Company event day',
        });
        const list = await listCalendarDates(app, token, {
          from: NEXT_MONDAY,
          to: NEXT_MONDAY,
        }).expect(200);
        expect(workCalendarDatePageSchema.parse(list.body).items).toEqual([
          { date: NEXT_MONDAY, isWorkingDay: true, description: 'Company event day' },
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should clear the description when HR saves the date without one',
      async () => {
        const token = tokenFor(hrAccountId, Role.HR);
        await putCalendarDate(app, token, WORKING_SATURDAY, OFFICE_CLOSED_REQUEST).expect(200);

        const response = await putCalendarDate(app, token, WORKING_SATURDAY, {
          isWorkingDay: false,
        }).expect(200);

        expect(workCalendarDateSchema.parse(response.body)).toEqual({
          date: WORKING_SATURDAY,
          isWorkingDay: false,
          description: null,
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should store an exception that matches the regular schedule, since the day is already off',
      async () => {
        // 2026-11-07 is a Saturday, which the default schedule already leaves off (D-44).
        const response = await putCalendarDate(app, tokenFor(hrAccountId, Role.HR), '2026-11-07', {
          isWorkingDay: false,
          description: 'Holiday on a day off',
        }).expect(200);

        expect(response.body).toMatchObject({ date: '2026-11-07', isWorkingDay: false });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse a blank description with 400 and store nothing',
      async () => {
        const response = await putCalendarDate(app, tokenFor(hrAccountId, Role.HR), NEXT_MONDAY, {
          isWorkingDay: false,
          description: '   ',
        }).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse a body with an unknown field with 400',
      async () => {
        const response = await putCalendarDate(app, tokenFor(hrAccountId, Role.HR), NEXT_MONDAY, {
          isWorkingDay: false,
          date: NEXT_MONDAY,
        }).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse a date path that is not an ISO date with 400',
      async () => {
        const response = await putCalendarDate(
          app,
          tokenFor(hrAccountId, Role.HR),
          'next-monday',
          OFFICE_CLOSED_REQUEST,
        ).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('when HR deletes an exception', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await startApp(await createEmptyDatabaseUri(container.getConnectionUri()));
      await putCalendarDate(app, tokenFor(hrAccountId, Role.HR), NEXT_MONDAY, {
        isWorkingDay: false,
        description: 'Public holiday',
      }).expect(200);
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      await app?.close();
    }, CONTAINER_TIMEOUT_MS);

    it(
      'should answer 204 and remove the exception from the list when HR deletes a future date',
      async () => {
        const token = tokenFor(hrAccountId, Role.HR);

        const response = await deleteCalendarDate(app, token, NEXT_MONDAY).expect(204);
        expect(response.text).toBe('');

        const list = await listCalendarDates(app, token, {
          from: NEXT_MONDAY,
          to: NEXT_MONDAY,
        }).expect(200);
        expect(workCalendarDatePageSchema.parse(list.body).items).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 404 when HR deletes a future date that has no exception',
      async () => {
        const response = await deleteCalendarDate(
          app,
          tokenFor(hrAccountId, Role.HR),
          NEXT_MONDAY,
        ).expect(404);

        expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('when HR changes a date that is today or in the past', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await startApp(await createEmptyDatabaseUri(container.getConnectionUri()));
      await putCalendarDate(app, tokenFor(hrAccountId, Role.HR), NEXT_MONDAY, {
        isWorkingDay: false,
        description: 'Public holiday',
      }).expect(200);
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      await app?.close();
    }, CONTAINER_TIMEOUT_MS);

    it(
      'should answer 409 when HR saves today',
      async () => {
        const response = await putCalendarDate(
          app,
          tokenFor(hrAccountId, Role.HR),
          TODAY,
          OFFICE_CLOSED_REQUEST,
        ).expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: 'WORK_CALENDAR_DATE_NOT_FUTURE',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 409 when HR saves a past date',
      async () => {
        const response = await putCalendarDate(
          app,
          tokenFor(hrAccountId, Role.HR),
          PAST_DATE,
          OFFICE_CLOSED_REQUEST,
        ).expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: 'WORK_CALENDAR_DATE_NOT_FUTURE',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 409 when HR deletes today',
      async () => {
        const response = await deleteCalendarDate(
          app,
          tokenFor(hrAccountId, Role.HR),
          TODAY,
        ).expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: 'WORK_CALENDAR_DATE_NOT_FUTURE',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 409 when HR deletes a past date',
      async () => {
        const response = await deleteCalendarDate(
          app,
          tokenFor(hrAccountId, Role.HR),
          PAST_DATE,
        ).expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          code: 'WORK_CALENDAR_DATE_NOT_FUTURE',
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 409 and leave the exception as it was when the date passes before HR saves it',
      async () => {
        const token = tokenFor(hrAccountId, Role.HR);
        mutableClock.current = new Date('2026-11-09T02:00:00Z');

        await putCalendarDate(app, token, NEXT_MONDAY, OFFICE_CLOSED_REQUEST).expect(409);

        const list = await listCalendarDates(app, token, {
          from: NEXT_MONDAY,
          to: NEXT_MONDAY,
        }).expect(200);
        expect(workCalendarDatePageSchema.parse(list.body).items).toEqual([
          { date: NEXT_MONDAY, isWorkingDay: false, description: 'Public holiday' },
        ]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('when an employee calls the calendar routes', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await startApp(await createEmptyDatabaseUri(container.getConnectionUri()));
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      await app?.close();
    }, CONTAINER_TIMEOUT_MS);

    it(
      'should refuse the list with 403 when an employee asks',
      async () => {
        await listCalendarDates(app, tokenFor(employeeAccountId, Role.EMPLOYEE), {
          from: '2026-11-01',
          to: '2026-11-30',
        }).expect(403);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse the save with 403 when an employee sends it',
      async () => {
        await putCalendarDate(
          app,
          tokenFor(employeeAccountId, Role.EMPLOYEE),
          NEXT_MONDAY,
          OFFICE_CLOSED_REQUEST,
        ).expect(403);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should refuse the delete with 403 when an employee sends it',
      async () => {
        await deleteCalendarDate(
          app,
          tokenFor(employeeAccountId, Role.EMPLOYEE),
          NEXT_MONDAY,
        ).expect(403);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('when HR adds a holiday for next Monday', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await startApp(await createEmptyDatabaseUri(container.getConnectionUri()));
    }, CONTAINER_TIMEOUT_MS);

    afterAll(async () => {
      await app?.close();
    }, CONTAINER_TIMEOUT_MS);

    it(
      'should classify a Monday punch as CHECKIN_NOT_REQUIRED once the holiday is saved',
      async () => {
        const employeeToken = tokenFor(employeeAccountId, Role.EMPLOYEE);
        const hrToken = tokenFor(hrAccountId, Role.HR);
        // Without the holiday, the same Monday punch is classified by the schedule, so the change is the cause.
        mutableClock.current = MONDAY_AFTER_PUNCH_CONTROL_INSTANT;
        const control = await postClockIn(app, employeeToken).expect(201);
        expect(control.body).toMatchObject({
          businessDate: MONDAY_AFTER_PUNCH_CONTROL,
          classification: 'LATE_CHECKIN',
        });

        mutableClock.current = SUNDAY_BEFORE_NEXT_MONDAY_INSTANT;
        await putCalendarDate(app, hrToken, NEXT_MONDAY, {
          isWorkingDay: false,
          description: 'Public holiday',
        }).expect(200);

        mutableClock.current = NEXT_MONDAY_LATE_PUNCH_INSTANT;
        const response = await postClockIn(app, employeeToken).expect(201);

        expect(response.body).toMatchObject({
          businessDate: NEXT_MONDAY,
          classification: 'CHECKIN_NOT_REQUIRED',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });
});
