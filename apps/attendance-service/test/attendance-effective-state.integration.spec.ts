import { randomUUID } from 'node:crypto';
import { CLOCK, configureApp, parseConfig, ServiceName, type IClock } from '@dexa/common';
import {
  attendanceMonitoringPageSchema,
  attendanceSummaryPageSchema,
  Role,
  type AttendanceMonitoringItem,
  type AttendanceSummaryItem,
} from '@dexa/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AttendanceServiceConfigSchema } from '../src/config/attendance-service-config.schema.js';
import {
  EMPLOYEE_CLIENT,
  type IEmployeeClient,
} from '../src/employees/employee-client.interface.js';
import type { AuthKeySet } from './auth-key-set.js';
import {
  attendanceServiceAuthKeys,
  attendanceServiceEnvironment,
} from './attendance-service-environment.js';
import { signGatewayUserToken } from './gateway-user-token.js';
import { CONTAINER_TIMEOUT_MS, TEST_TIMEOUT_MS, createEmptyDatabaseUri } from './test-database.js';

// The lifetime of the token api-gateway sends for a call.
const TOKEN_LIFETIME_SECONDS = 60;
const CLOCK_IN_PATH = '/api/v1/attendance/clock-in';
const CLOCK_OUT_PATH = '/api/v1/attendance/clock-out';
const SUMMARY_PATH = '/api/v1/attendance/me';
const MONITORING_PATH = '/api/v1/attendance';
const CORRECTION_PATH = '/api/v1/attendance-corrections';
const OVERTIME_PATH = '/api/v1/overtime-requests';
// The default schedule takes effect on the business date the clock reads at startup: Monday 2026-11-02, 09:00 to 18:00
// WIB, Monday to Friday. Saturday is a day off.
const FIRST_START_INSTANT = new Date('2026-11-02T01:00:00Z');
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const WEDNESDAY = '2026-11-04';
const THURSDAY = '2026-11-05';
const FRIDAY = '2026-11-06';
const SATURDAY = '2026-11-07';
// Friday 10:00 WIB submits for every weekday above (all inside the 7-day overtime and 30-day correction windows).
const FRIDAY_SUBMIT_MOMENT = new Date('2026-11-06T03:00:00Z');
// Saturday 10:00 WIB submits the Saturday overtime, so the request date is not in the future.
const SATURDAY_SUBMIT_MOMENT = new Date('2026-11-07T03:00:00Z');
// The database requires reviewed_at >= created_at, and created_at is the real insert time, so decisions happen after
// the suite starts (the same pattern as the decision suites).
const ONE_HOUR_MS = 60 * 60 * 1000;
const DECISION_MOMENT = new Date(Date.now() + ONE_HOUR_MS);

const mutableClock: { current: Date } = { current: FIRST_START_INSTANT };
const fixedClock: IClock = { now: () => new Date(mutableClock.current) };

// Stands in for employee-service. The rows here carry no names, so no account is looked up.
const emptyEmployeeClient: IEmployeeClient = {
  lookupEmployees: () => Promise.resolve([]),
};

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let keys: AuthKeySet;

function tokenFor(accountId: string, role: Role = Role.EMPLOYEE): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  return signGatewayUserToken(keys, ServiceName.ATTENDANCE_SERVICE, accountId, role, expiresAt);
}

async function punchAs(accountId: string, punchPath: string, instant: Date): Promise<void> {
  mutableClock.current = instant;
  await request(app.getHttpServer())
    .post(punchPath)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .send({})
    .expect(201);
}

async function submitCorrection(
  accountId: string,
  body: Record<string, unknown>,
  at: Date,
): Promise<string> {
  mutableClock.current = at;
  const response = await request(app.getHttpServer())
    .post(CORRECTION_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .send({ idempotencyKey: randomUUID(), ...body })
    .expect(201);
  return response.body.id;
}

async function decideCorrection(
  requestId: string,
  action: 'approve' | 'reject',
  at: Date,
  body: Record<string, unknown> = {},
): Promise<void> {
  mutableClock.current = at;
  await request(app.getHttpServer())
    .post(`${CORRECTION_PATH}/${requestId}/${action}`)
    .set('Authorization', `Bearer ${tokenFor(randomUUID(), Role.HR)}`)
    .send(body)
    .expect(200);
}

async function submitOvertime(
  accountId: string,
  businessDate: string,
  startAt: string,
  endAt: string,
  at: Date,
): Promise<string> {
  mutableClock.current = at;
  const response = await request(app.getHttpServer())
    .post(OVERTIME_PATH)
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .send({
      businessDate,
      startAt,
      endAt,
      reason: 'Release deployment',
      idempotencyKey: randomUUID(),
    })
    .expect(201);
  return response.body.id;
}

async function decideOvertime(
  requestId: string,
  action: 'approve' | 'reject',
  at: Date,
  body: Record<string, unknown> = {},
): Promise<void> {
  mutableClock.current = at;
  await request(app.getHttpServer())
    .post(`${OVERTIME_PATH}/${requestId}/${action}`)
    .set('Authorization', `Bearer ${tokenFor(randomUUID(), Role.HR)}`)
    .send(body)
    .expect(200);
}

// The HR list for one account over the test range, so each account's rows are read on their own.
async function listMonitoringRows(accountId: string): Promise<AttendanceMonitoringItem[]> {
  const response = await request(app.getHttpServer())
    .get(MONITORING_PATH)
    .query({ from: MONDAY, to: SATURDAY, employeeId: accountId })
    .set('Authorization', `Bearer ${tokenFor(randomUUID(), Role.HR)}`)
    .expect(200);
  return attendanceMonitoringPageSchema.parse(response.body).items;
}

// The employee's own summary for the test range, read with that employee's token.
async function readSummaryRows(accountId: string): Promise<AttendanceSummaryItem[]> {
  const response = await request(app.getHttpServer())
    .get(SUMMARY_PATH)
    .query({ from: MONDAY, to: SATURDAY })
    .set('Authorization', `Bearer ${tokenFor(accountId)}`)
    .expect(200);
  return attendanceSummaryPageSchema.parse(response.body).items;
}

function rowOn(rows: ReadonlyArray<AttendanceMonitoringItem>, businessDate: string) {
  const row = rows.find((candidate) => candidate.businessDate === businessDate);
  if (row === undefined) throw new Error(`No row for ${businessDate}.`);
  return row;
}

function summaryRowOn(rows: ReadonlyArray<AttendanceSummaryItem>, businessDate: string) {
  const row = rows.find((candidate) => candidate.businessDate === businessDate);
  if (row === undefined) throw new Error(`No summary row for ${businessDate}.`);
  return row;
}

async function startApp(databaseUrl: string): Promise<INestApplication> {
  const config = parseConfig(
    AttendanceServiceConfigSchema,
    attendanceServiceEnvironment({ ATTENDANCE_DATABASE_URL: databaseUrl }),
  );
  const moduleRef = await Test.createTestingModule({ imports: [createAppModule(config)] })
    .overrideProvider(CLOCK)
    .useValue(fixedClock)
    .overrideProvider(EMPLOYEE_CLIENT)
    .useValue(emptyEmployeeClient)
    .compile();
  const nestApp = moduleRef.createNestApplication();
  configureApp(nestApp, { CORS_ORIGINS: [] });
  await nestApp.init();
  return nestApp;
}

// Each account plays one scenario, so no scenario changes another account's rows. The scenarios are set up through
// the real punch, correction, and overtime endpoints, so every stored day has the snapshots production writes.
const accounts = {
  // Punched, then corrected by an approved PRESENT correction (the raw punches stay as punched).
  corrected: randomUUID(),
  // Punched, with no correction.
  punchedOnly: randomUUID(),
  // Two approved overtime intervals on Monday and one approved interval on Tuesday.
  overtime: randomUUID(),
  // One approved interval on Monday, which must not count toward another account's minutes.
  otherOvertime: randomUUID(),
  // One approved interval of 90 seconds, so the minutes keep their fraction.
  fractionalOvertime: randomUUID(),
  // A pending correction and a pending overtime request on a punched day, and a pending correction on a day with no punch.
  pendingOnly: randomUUID(),
  // An approved sick-leave correction on a day with no punch.
  sickLeave: randomUUID(),
  // A punched day that an approved leave correction turned into a leave day.
  leave: randomUUID(),
  // A day off that a request created, with an approved overtime interval.
  dayOffOvertime: randomUUID(),
  // A pending overtime request and a rejected overtime request on Monday, with no approved interval.
  pendingAndRejectedOvertime: randomUUID(),
  // A punched day with a correction that HR rejected.
  rejectedCorrection: randomUUID(),
};

async function seedScenarios(): Promise<void> {
  await punchAs(accounts.corrected, CLOCK_IN_PATH, new Date('2026-11-02T03:00:00Z'));
  await punchAs(accounts.corrected, CLOCK_OUT_PATH, new Date('2026-11-02T11:00:00Z'));
  const correctedRequest = await submitCorrection(
    accounts.corrected,
    {
      requestedDayStatus: 'PRESENT',
      businessDate: MONDAY,
      clockInAt: '2026-11-02T09:20:00+07:00',
      clockOutAt: '2026-11-02T17:00:00+07:00',
      reason: 'Forgot to clock in',
    },
    FRIDAY_SUBMIT_MOMENT,
  );
  await decideCorrection(correctedRequest, 'approve', DECISION_MOMENT);

  await punchAs(accounts.punchedOnly, CLOCK_IN_PATH, new Date('2026-11-04T02:00:00Z'));
  await punchAs(accounts.punchedOnly, CLOCK_OUT_PATH, new Date('2026-11-04T11:00:00Z'));

  const mondayFirst = await submitOvertime(
    accounts.overtime,
    MONDAY,
    `${MONDAY}T18:00:00+07:00`,
    `${MONDAY}T19:00:00+07:00`,
    FRIDAY_SUBMIT_MOMENT,
  );
  const mondaySecond = await submitOvertime(
    accounts.overtime,
    MONDAY,
    `${MONDAY}T19:30:00+07:00`,
    `${MONDAY}T21:00:00+07:00`,
    FRIDAY_SUBMIT_MOMENT,
  );
  const tuesdayOvertime = await submitOvertime(
    accounts.overtime,
    TUESDAY,
    `${TUESDAY}T18:00:00+07:00`,
    `${TUESDAY}T18:30:00+07:00`,
    FRIDAY_SUBMIT_MOMENT,
  );
  await decideOvertime(mondayFirst, 'approve', DECISION_MOMENT);
  await decideOvertime(mondaySecond, 'approve', DECISION_MOMENT);
  await decideOvertime(tuesdayOvertime, 'approve', DECISION_MOMENT);

  const otherOvertime = await submitOvertime(
    accounts.otherOvertime,
    MONDAY,
    `${MONDAY}T19:00:00+07:00`,
    `${MONDAY}T21:00:00+07:00`,
    FRIDAY_SUBMIT_MOMENT,
  );
  await decideOvertime(otherOvertime, 'approve', DECISION_MOMENT);

  const fractionalOvertime = await submitOvertime(
    accounts.fractionalOvertime,
    MONDAY,
    `${MONDAY}T18:00:00+07:00`,
    `${MONDAY}T18:01:30+07:00`,
    FRIDAY_SUBMIT_MOMENT,
  );
  await decideOvertime(fractionalOvertime, 'approve', DECISION_MOMENT);

  await punchAs(accounts.pendingOnly, CLOCK_IN_PATH, new Date('2026-11-05T02:00:00Z'));
  await punchAs(accounts.pendingOnly, CLOCK_OUT_PATH, new Date('2026-11-05T11:00:00Z'));
  await submitCorrection(
    accounts.pendingOnly,
    {
      requestedDayStatus: 'PRESENT',
      businessDate: THURSDAY,
      clockInAt: '2026-11-05T08:00:00+07:00',
      clockOutAt: '2026-11-05T17:00:00+07:00',
      reason: 'Forgot to clock in',
    },
    FRIDAY_SUBMIT_MOMENT,
  );
  await submitOvertime(
    accounts.pendingOnly,
    THURSDAY,
    `${THURSDAY}T18:00:00+07:00`,
    `${THURSDAY}T19:00:00+07:00`,
    FRIDAY_SUBMIT_MOMENT,
  );
  await submitCorrection(
    accounts.pendingOnly,
    { requestedDayStatus: 'SICK_LEAVE', businessDate: FRIDAY, reason: 'Doctor note on file' },
    FRIDAY_SUBMIT_MOMENT,
  );

  const sickLeaveRequest = await submitCorrection(
    accounts.sickLeave,
    { requestedDayStatus: 'SICK_LEAVE', businessDate: TUESDAY, reason: 'Doctor note on file' },
    FRIDAY_SUBMIT_MOMENT,
  );
  await decideCorrection(sickLeaveRequest, 'approve', DECISION_MOMENT);

  await punchAs(accounts.leave, CLOCK_IN_PATH, new Date('2026-11-04T02:00:00Z'));
  await punchAs(accounts.leave, CLOCK_OUT_PATH, new Date('2026-11-04T11:00:00Z'));
  const leaveRequest = await submitCorrection(
    accounts.leave,
    { requestedDayStatus: 'LEAVE', businessDate: WEDNESDAY, reason: 'Family matter' },
    FRIDAY_SUBMIT_MOMENT,
  );
  await decideCorrection(leaveRequest, 'approve', DECISION_MOMENT);

  const dayOffOvertime = await submitOvertime(
    accounts.dayOffOvertime,
    SATURDAY,
    `${SATURDAY}T19:00:00+07:00`,
    `${SATURDAY}T20:00:00+07:00`,
    SATURDAY_SUBMIT_MOMENT,
  );
  await decideOvertime(dayOffOvertime, 'approve', DECISION_MOMENT);

  await submitOvertime(
    accounts.pendingAndRejectedOvertime,
    MONDAY,
    `${MONDAY}T21:30:00+07:00`,
    `${MONDAY}T22:00:00+07:00`,
    FRIDAY_SUBMIT_MOMENT,
  );
  const rejectedOvertime = await submitOvertime(
    accounts.pendingAndRejectedOvertime,
    MONDAY,
    `${MONDAY}T22:30:00+07:00`,
    `${MONDAY}T23:00:00+07:00`,
    FRIDAY_SUBMIT_MOMENT,
  );
  await decideOvertime(rejectedOvertime, 'reject', DECISION_MOMENT, {
    reviewReason: 'Not approved',
  });

  await punchAs(accounts.rejectedCorrection, CLOCK_IN_PATH, new Date('2026-11-03T02:00:00Z'));
  await punchAs(accounts.rejectedCorrection, CLOCK_OUT_PATH, new Date('2026-11-03T11:00:00Z'));
  const rejectedCorrectionRequest = await submitCorrection(
    accounts.rejectedCorrection,
    {
      requestedDayStatus: 'PRESENT',
      businessDate: TUESDAY,
      clockInAt: '2026-11-03T08:30:00+07:00',
      clockOutAt: '2026-11-03T18:30:00+07:00',
      reason: 'Forgot to clock in',
    },
    FRIDAY_SUBMIT_MOMENT,
  );
  await decideCorrection(rejectedCorrectionRequest, 'reject', DECISION_MOMENT, {
    reviewReason: 'Not verified',
  });
}

describe('attendance effective state and approved overtime', () => {
  beforeAll(async () => {
    keys = attendanceServiceAuthKeys();
    container = await new PostgreSqlContainer('postgres:18').start();
    const databaseUrl = await createEmptyDatabaseUri(container.getConnectionUri());
    app = await startApp(databaseUrl);
    await seedScenarios();
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  it(
    'should show the raw punches next to the corrected times and flag the day as corrected in monitoring',
    async () => {
      const row = rowOn(await listMonitoringRows(accounts.corrected), MONDAY);

      expect(row).toMatchObject({
        dayStatus: 'PRESENT',
        approvedOvertimeMinutes: 0,
        rawClockInAt: '2026-11-02T03:00:00.000Z',
        rawClockOutAt: '2026-11-02T11:00:00.000Z',
        isCorrected: true,
        clockInAt: '2026-11-02T02:20:00.000Z',
        clockInStatus: 'LATE_CHECKIN',
        clockOutAt: '2026-11-02T10:00:00.000Z',
        clockOutStatus: 'EARLY_CHECKOUT',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show the corrected effective times and not the raw punches in the employee summary',
    async () => {
      const row = summaryRowOn(await readSummaryRows(accounts.corrected), MONDAY);

      expect(row).toEqual({
        businessDate: MONDAY,
        dayStatus: 'PRESENT',
        approvedOvertimeMinutes: 0,
        clockInAt: '2026-11-02T02:20:00.000Z',
        clockInStatus: 'LATE_CHECKIN',
        clockOutAt: '2026-11-02T10:00:00.000Z',
        clockOutStatus: 'EARLY_CHECKOUT',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show the raw punches equal to the effective times and not corrected when the day has no correction',
    async () => {
      const row = rowOn(await listMonitoringRows(accounts.punchedOnly), WEDNESDAY);

      expect(row).toMatchObject({
        dayStatus: 'PRESENT',
        isCorrected: false,
        rawClockInAt: '2026-11-04T02:00:00.000Z',
        rawClockOutAt: '2026-11-04T11:00:00.000Z',
        clockInAt: '2026-11-04T02:00:00.000Z',
        clockOutAt: '2026-11-04T11:00:00.000Z',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should sum the approved overtime intervals of one business date in monitoring and in the summary',
    async () => {
      const monitoringRow = rowOn(await listMonitoringRows(accounts.overtime), MONDAY);
      const summaryRow = summaryRowOn(await readSummaryRows(accounts.overtime), MONDAY);

      expect(monitoringRow).toMatchObject({ dayStatus: 'PENDING', approvedOvertimeMinutes: 150 });
      expect(summaryRow).toMatchObject({ dayStatus: 'PENDING', approvedOvertimeMinutes: 150 });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should count approved overtime only on the business date of its interval',
    async () => {
      const rows = await readSummaryRows(accounts.overtime);

      expect(summaryRowOn(rows, TUESDAY).approvedOvertimeMinutes).toBe(30);
      expect(summaryRowOn(rows, MONDAY).approvedOvertimeMinutes).toBe(150);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should not count another account overtime on the same business date',
    async () => {
      const overtimeRow = summaryRowOn(await readSummaryRows(accounts.overtime), MONDAY);
      const otherRow = summaryRowOn(await readSummaryRows(accounts.otherOvertime), MONDAY);

      expect(overtimeRow.approvedOvertimeMinutes).toBe(150);
      expect(otherRow.approvedOvertimeMinutes).toBe(120);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the seconds of approved overtime in the minutes',
    async () => {
      const row = summaryRowOn(await readSummaryRows(accounts.fractionalOvertime), MONDAY);

      expect(row.approvedOvertimeMinutes).toBe(1.5);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should count pending and rejected overtime as zero minutes and keep the day pending',
    async () => {
      const row = rowOn(await listMonitoringRows(accounts.pendingAndRejectedOvertime), MONDAY);

      expect(row).toMatchObject({
        dayStatus: 'PENDING',
        approvedOvertimeMinutes: 0,
        rawClockInAt: null,
        rawClockOutAt: null,
        isCorrected: false,
        clockInAt: null,
        clockInStatus: 'PENDING_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should leave the effective times and status unchanged while a correction and an overtime request are pending',
    async () => {
      const row = rowOn(await listMonitoringRows(accounts.pendingOnly), THURSDAY);

      expect(row).toMatchObject({
        dayStatus: 'PRESENT',
        approvedOvertimeMinutes: 0,
        rawClockInAt: '2026-11-05T02:00:00.000Z',
        rawClockOutAt: '2026-11-05T11:00:00.000Z',
        isCorrected: false,
        clockInAt: '2026-11-05T02:00:00.000Z',
        clockOutAt: '2026-11-05T11:00:00.000Z',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show a request-created day as pending when only a correction on it is pending',
    async () => {
      const row = summaryRowOn(await readSummaryRows(accounts.pendingOnly), FRIDAY);

      expect(row).toEqual({
        businessDate: FRIDAY,
        dayStatus: 'PENDING',
        approvedOvertimeMinutes: 0,
        clockInAt: null,
        clockInStatus: 'PENDING_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the day uncorrected when HR rejects the correction',
    async () => {
      const row = rowOn(await listMonitoringRows(accounts.rejectedCorrection), TUESDAY);

      expect(row).toMatchObject({
        dayStatus: 'PRESENT',
        isCorrected: false,
        rawClockInAt: '2026-11-03T02:00:00.000Z',
        rawClockOutAt: '2026-11-03T11:00:00.000Z',
        clockInAt: '2026-11-03T02:00:00.000Z',
        clockOutAt: '2026-11-03T11:00:00.000Z',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show an approved sick leave on a day with no punch as a corrected day with no effective times',
    async () => {
      const monitoringRow = rowOn(await listMonitoringRows(accounts.sickLeave), TUESDAY);
      const summaryRow = summaryRowOn(await readSummaryRows(accounts.sickLeave), TUESDAY);

      expect(monitoringRow).toMatchObject({
        dayStatus: 'SICK_LEAVE',
        approvedOvertimeMinutes: 0,
        rawClockInAt: null,
        rawClockOutAt: null,
        isCorrected: true,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      });
      expect(summaryRow).toEqual({
        businessDate: TUESDAY,
        dayStatus: 'SICK_LEAVE',
        approvedOvertimeMinutes: 0,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the raw punches of an approved leave day while its effective times are cleared',
    async () => {
      const monitoringRow = rowOn(await listMonitoringRows(accounts.leave), WEDNESDAY);
      const summaryRow = summaryRowOn(await readSummaryRows(accounts.leave), WEDNESDAY);

      expect(monitoringRow).toMatchObject({
        dayStatus: 'LEAVE',
        isCorrected: true,
        rawClockInAt: '2026-11-04T02:00:00.000Z',
        rawClockOutAt: '2026-11-04T11:00:00.000Z',
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      });
      expect(summaryRow).toMatchObject({
        dayStatus: 'LEAVE',
        clockInAt: null,
        clockOutAt: null,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should show a request-created day off with its approved overtime and not-required timing statuses',
    async () => {
      const monitoringRow = rowOn(await listMonitoringRows(accounts.dayOffOvertime), SATURDAY);
      const summaryRow = summaryRowOn(await readSummaryRows(accounts.dayOffOvertime), SATURDAY);

      expect(monitoringRow).toMatchObject({
        dayStatus: 'DAY_OFF',
        approvedOvertimeMinutes: 60,
        rawClockInAt: null,
        rawClockOutAt: null,
        isCorrected: false,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      });
      expect(summaryRow).toMatchObject({ dayStatus: 'DAY_OFF', approvedOvertimeMinutes: 60 });
    },
    TEST_TIMEOUT_MS,
  );
});
