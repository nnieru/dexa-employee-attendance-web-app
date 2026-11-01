import { Buffer } from 'node:buffer';
import { createSign, randomUUID } from 'node:crypto';
import {
  configureApp,
  DependencyUnavailableError,
  parseConfig,
  Roles,
  ServiceName,
  type AuthenticatedUser,
  type InternalBinaryResponse,
} from '@dexa/common';
import {
  ErrorCode,
  loginResponseSchema,
  type AttendanceMonitoringPage,
  type AttendanceMonitoringQuery,
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPE,
  PHOTO_THUMBNAIL_DATA_URL_PREFIX,
  Portal,
  Role,
  type CreateEmployeeRequest,
  type EmployeeDetail,
  type EmployeeListPage,
  type EmployeeListQuery,
  type EmployeeProvisioningIncompleteDetails,
  type MasterOption,
  type Notification,
  type NotificationPage,
  type OwnProfile,
  type PhotoThumbnailRequest,
  type PhotoThumbnailResponse,
  type UpdateEmployeeRequest,
  type UpdateOwnProfileRequest,
  type WorkCalendarDate,
  type WorkCalendarDateListQuery,
  type WorkCalendarDatePage,
  type WorkCalendarDateRequest,
  type WorkScheduleVersion,
  type WorkScheduleVersionRequest,
} from '@dexa/contracts';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { verifyGatewayToken } from './gateway-token.js';
import { z } from 'zod';
import { createAppModule } from '../src/app.module.js';
import {
  ATTENDANCE_SERVICE_CLIENT,
  type IAttendanceServiceClient,
} from '../src/attendance/attendance-service-client.interface.js';
import {
  WORK_SCHEDULE_CLIENT,
  type IWorkScheduleClient,
} from '../src/schedules/work-schedule-client.interface.js';
import {
  WORK_CALENDAR_DATE_CLIENT,
  type IWorkCalendarDateClient,
} from '../src/schedules/work-calendar-date-client.interface.js';
import {
  EMPLOYEE_SERVICE_CLIENT,
  type IEmployeeServiceClient,
} from '../src/employees/employee-service-client.interface.js';
import { ApiGatewayConfigSchema } from '../src/config/api-gateway-config.schema.js';
import {
  authEnvironmentFor,
  generateAuthKeySet,
  servicePair,
  userJwtSigningEnvironmentFor,
  userJwtVerifierEnvironmentFor,
  USER_JWT_AUDIENCE,
  USER_JWT_ISSUER,
  type AuthKeySet,
} from './auth-key-set.js';
import {
  startAuthServiceProcess,
  UNREACHABLE_BROKER_URL,
  type RunningAuthService,
} from './auth-service-process.js';
import {
  startNotificationServiceStub,
  type NotificationServiceStub,
  type UpstreamStream,
} from './notification-service-stub.js';

// Starting the container and the auth-service process takes several seconds on a cold machine.
const SETUP_TIMEOUT_MS = 180_000;
// Each sign-in runs one argon2id verification in auth-service.
const TEST_TIMEOUT_MS = 60_000;
const LOGIN_PATH = '/api/v1/auth/login';
const CURRENT_ACCOUNT_PATH = '/api/v1/auth/me';
const HEALTH_PATH = '/api/v1/health';
const HR_ROUTE_PATH = '/api/v1/route-guard-tests/hr';
const POSITIONS_PATH = '/api/v1/positions';
const EMPLOYEE_STATUSES_PATH = '/api/v1/employee-statuses';
const WORK_SCHEDULES_PATH = '/api/v1/work-schedules';
const WORK_CALENDAR_DATES_PATH = '/api/v1/work-calendar-dates';
const CREATE_EMPLOYEE_PATH = '/api/v1/employees';
const OWN_PROFILE_PATH = '/api/v1/employees/me';
const OWN_PHOTO_PATH = '/api/v1/employees/me/photo';
const EMPLOYEE_LIST_PATH = '/api/v1/employees';
const EMPLOYEE_PHOTO_PATH = (accountId: string) => `/api/v1/employees/${accountId}/photo`;
const THUMBNAIL_PATH = '/api/v1/employees/photo-thumbnails';
const ATTENDANCE_LIST_PATH = '/api/v1/attendance';
const ATTENDANCE_RECORD_PATH = `${ATTENDANCE_LIST_PATH}/${randomUUID()}`;
const PHOTO_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const STORED_PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const SELF_SERVICE_ROUTE_PATH = '/api/v1/route-guard-tests/self-service';
const SIGNED_TOKEN_LIFETIME_SECONDS = 300;
const NOTIFICATION_STREAM_PATH = '/api/v1/notifications/stream';
const FIRST_NOTIFICATION_FRAME = 'event: notification\ndata: {"id":"first"}\n\n';
const INBOX_LIST_PATH = '/api/v1/notifications';
const INBOX_UNREAD_COUNT_PATH = '/api/v1/notifications/unread-count';
const INBOX_CURSOR = 'b3BhcXVlLWN1cnNvcg';
const EMPTY_INBOX_ANSWER = { status: 200, body: { items: [], nextCursor: null } };
const INBOX_ID = randomUUID();
const INBOX_READ_PATH = `${INBOX_LIST_PATH}/${INBOX_ID}/read`;
const INBOX_NOTIFICATION: Notification = {
  id: INBOX_ID,
  eventType: 'employee.profile.updated',
  title: 'Budi Santoso updated: phone number',
  body: 'Changed fields: phone number.',
  data: { changedFields: ['phoneNumber'] },
  occurredAt: '2026-10-30T02:05:00.000Z',
  createdAt: '2026-10-30T02:05:01.000Z',
  readAt: null,
};
const INBOX_PAGE: NotificationPage = { items: [INBOX_NOTIFICATION], nextCursor: INBOX_CURSOR };
const SECOND_NOTIFICATION_FRAME = 'event: notification\ndata: {"id":"second"}\n\n';
// A relayed frame that does not arrive in this time means the gateway is holding it back.
const RELAY_TIMEOUT_MS = 5_000;

const HR_EMAIL = 'hr.admin@dexa.test';
const HR_PASSWORD = 'hr-admin-pass-1';
const EMPLOYEE_EMAIL = 'employee.one@dexa.test';
const EMPLOYEE_ACCOUNT_ID = randomUUID();
const DEACTIVATED_EMAIL = 'employee.two@dexa.test';
const ADMIN_DEACTIVATED_EMAIL = 'employee.three@dexa.test';
const SERVICE_TOKEN_LIFETIME_SECONDS_FOR_CALLS = 60;
const ACCOUNT_STATUS_PATH = (accountId: string) =>
  `/api/v1/internal/accounts/${accountId}/active-status`;

const ACCOUNT_DISABLED_BODY = {
  statusCode: 401,
  code: 'ACCOUNT_DISABLED',
  message: 'This account is no longer active.',
};

@Controller('route-guard-tests/hr')
class StubHrController {
  @Roles(Role.HR)
  @Get()
  getHrRoute(): { route: string } {
    return { route: 'hr' };
  }
}

// Stands in for employee-service, so these tests cover the gateway's own checks without starting it.
// Each call records the user it was given, so a test can show the gateway acted for the caller.
const POSITIONS: MasterOption[] = [
  { id: randomUUID(), code: 'DATA_ANALYST', name: 'Data Analyst', isActive: false },
  { id: randomUUID(), code: 'HR_OFFICER', name: 'HR Officer', isActive: true },
];
const EMPLOYEE_STATUSES: MasterOption[] = [
  { id: randomUUID(), code: 'ACTIVE', name: 'Active', isActive: true },
];
const OWN_PROFILE: OwnProfile = {
  accountId: randomUUID(),
  name: 'Nadia Rahma',
  email: 'nadia.rahma@dexa.test',
  position: { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
  phoneNumber: null,
  photoUrl: null,
  profileStatus: 'INCOMPLETE',
};
const NEW_EMPLOYEE: EmployeeDetail = {
  accountId: randomUUID(),
  name: 'Bima Saputra',
  email: 'bima.saputra@dexa.test',
  role: Role.EMPLOYEE,
  position: { id: randomUUID(), code: 'HR_OFFICER', name: 'HR Officer' },
  employeeStatus: { id: randomUUID(), code: 'ACTIVE', name: 'Active' },
  phoneNumber: null,
  profileStatus: 'INCOMPLETE',
};
const CREATE_EMPLOYEE_BODY = {
  operationId: randomUUID(),
  name: '  Bima Saputra ',
  email: 'Bima.Saputra@Dexa.Test',
  positionId: randomUUID(),
  employeeStatusId: randomUUID(),
  phoneNumber: null,
  role: Role.EMPLOYEE,
  initialPassword: 'initial-pass-1',
};
const INCOMPLETE_DETAILS: EmployeeProvisioningIncompleteDetails = {
  operationId: CREATE_EMPLOYEE_BODY.operationId,
  savedPhase: 'RESERVED',
};
const DEFAULT_CREATE_OUTCOME = (): Promise<EmployeeDetail> => Promise.resolve(NEW_EMPLOYEE);
// A test that needs another answer from employee-service replaces this, and the hook below restores it.
let createEmployeeOutcome: () => Promise<EmployeeDetail> = DEFAULT_CREATE_OUTCOME;
const forwardedUsers: AuthenticatedUser[] = [];
const forwardedAccountIds = (): string[] => forwardedUsers.map((user) => user.accountId);
const createRequests: CreateEmployeeRequest[] = [];
const profileUpdates: UpdateOwnProfileRequest[] = [];
const photoUploads: Buffer[] = [];
const OWN_PHOTO_FILE: InternalBinaryResponse = {
  contentType: PHOTO_CONTENT_TYPE,
  body: STORED_PHOTO_BYTES,
};
const LISTED_EMPLOYEE_ACCOUNT_ID = randomUUID();
const EMPLOYEE_LIST_PAGE: EmployeeListPage = {
  items: [
    {
      accountId: LISTED_EMPLOYEE_ACCOUNT_ID,
      name: 'Gita 100% Kusuma',
      email: 'gita.kusuma@dexa.test',
      role: Role.EMPLOYEE,
      position: { id: randomUUID(), code: 'HR_OFFICER', name: 'HR Officer' },
      employeeStatus: { id: randomUUID(), code: 'ACTIVE', name: 'Active' },
      phoneNumber: null,
      profileStatus: 'INCOMPLETE',
      photoUrl: `/api/v1/employees/${LISTED_EMPLOYEE_ACCOUNT_ID}/photo`,
    },
  ],
  page: 2,
  pageSize: 5,
  totalItems: 6,
  totalPages: 2,
};
const LISTED_EMPLOYEE_PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x48, 0x52]);
const EMPLOYEE_PHOTO_FILE: InternalBinaryResponse = {
  contentType: PHOTO_CONTENT_TYPE,
  body: LISTED_EMPLOYEE_PHOTO_BYTES,
};
const listQueries: EmployeeListQuery[] = [];
const requestedPhotoAccountIds: string[] = [];
const photoThumbnailRequests: PhotoThumbnailRequest[] = [];
const PHOTO_THUMBNAIL_PAGE: PhotoThumbnailResponse = {
  items: [
    {
      accountId: LISTED_EMPLOYEE_ACCOUNT_ID,
      thumbnail: `${PHOTO_THUMBNAIL_DATA_URL_PREFIX}${LISTED_EMPLOYEE_PHOTO_BYTES.toString('base64')}`,
    },
  ],
};
const updateRequests: { readonly accountId: string; readonly request: UpdateEmployeeRequest }[] =
  [];
const UPDATED_EMPLOYEE: EmployeeDetail = {
  accountId: EMPLOYEE_ACCOUNT_ID,
  name: 'Bima Saputra',
  email: EMPLOYEE_EMAIL,
  role: Role.EMPLOYEE,
  position: { id: randomUUID(), code: 'HR_OFFICER', name: 'HR Officer' },
  employeeStatus: { id: randomUUID(), code: 'ACTIVE', name: 'Active' },
  phoneNumber: null,
  profileStatus: 'INCOMPLETE',
};
const UPDATE_INCOMPLETE_MESSAGE =
  'The employee update did not finish. Check the employee before saving the update again.';
const UPDATE_INCOMPLETE_DETAILS = {
  accountId: EMPLOYEE_ACCOUNT_ID,
  profileSaved: true,
  accountStatusSaved: null,
  passwordReset: null,
};
const DEFAULT_UPDATE_OUTCOME = (): Promise<EmployeeDetail> => Promise.resolve(UPDATED_EMPLOYEE);
// A test that needs another answer from employee-service replaces this, and the afterEach hook restores it.
let updateEmployeeOutcome: () => Promise<EmployeeDetail> = DEFAULT_UPDATE_OUTCOME;
const employeeServiceFake: IEmployeeServiceClient = {
  updateOwnPhoto: (user: AuthenticatedUser, photo: Buffer) => {
    forwardedUsers.push(user);
    photoUploads.push(photo);
    return Promise.resolve(OWN_PROFILE);
  },
  getOwnPhoto: (user: AuthenticatedUser) => {
    forwardedUsers.push(user);
    return Promise.resolve(OWN_PHOTO_FILE);
  },
  getOwnProfile: (user: AuthenticatedUser) => {
    forwardedUsers.push(user);
    return Promise.resolve(OWN_PROFILE);
  },
  updateOwnProfile: (user: AuthenticatedUser, request: UpdateOwnProfileRequest) => {
    forwardedUsers.push(user);
    profileUpdates.push(request);
    return Promise.resolve({ ...OWN_PROFILE, phoneNumber: request.phoneNumber });
  },
  listPositions: (user: AuthenticatedUser) => {
    forwardedUsers.push(user);
    return Promise.resolve(POSITIONS);
  },
  listEmployeeStatuses: (user: AuthenticatedUser) => {
    forwardedUsers.push(user);
    return Promise.resolve(EMPLOYEE_STATUSES);
  },
  createEmployee: (user: AuthenticatedUser, request: CreateEmployeeRequest) => {
    forwardedUsers.push(user);
    createRequests.push(request);
    return createEmployeeOutcome();
  },
  updateEmployee: (user: AuthenticatedUser, accountId: string, request: UpdateEmployeeRequest) => {
    forwardedUsers.push(user);
    updateRequests.push({ accountId, request });
    return updateEmployeeOutcome();
  },
  listEmployees: (user: AuthenticatedUser, query: EmployeeListQuery) => {
    forwardedUsers.push(user);
    listQueries.push(query);
    return Promise.resolve(EMPLOYEE_LIST_PAGE);
  },
  getEmployeePhoto: (user: AuthenticatedUser, accountId: string) => {
    forwardedUsers.push(user);
    requestedPhotoAccountIds.push(accountId);
    return Promise.resolve(EMPLOYEE_PHOTO_FILE);
  },
  getPhotoThumbnails: (user: AuthenticatedUser, request: PhotoThumbnailRequest) => {
    forwardedUsers.push(user);
    photoThumbnailRequests.push(request);
    return Promise.resolve(PHOTO_THUMBNAIL_PAGE);
  },
};

const ATTENDANCE_EMPLOYEE_ACCOUNT_ID = randomUUID();
const ATTENDANCE_PAGE: AttendanceMonitoringPage = {
  items: [
    {
      accountId: ATTENDANCE_EMPLOYEE_ACCOUNT_ID,
      employee: { name: 'Gita Kusuma', positionName: 'HR Officer' },
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
  ],
  page: 2,
  pageSize: 5,
  totalItems: 6,
  totalPages: 2,
};
const attendanceListQueries: AttendanceMonitoringQuery[] = [];
const attendanceServiceFake: IAttendanceServiceClient = {
  clockIn: () => Promise.reject(new Error('The route guard tests never clock in.')),
  clockOut: () => Promise.reject(new Error('The route guard tests never clock out.')),
  getToday: () => Promise.reject(new Error('The route guard tests never read today.')),
  listOwnSummary: () =>
    Promise.reject(new Error('The route guard tests never list the own summary.')),
  listAttendance: (user: AuthenticatedUser, query: AttendanceMonitoringQuery) => {
    forwardedUsers.push(user);
    attendanceListQueries.push(query);
    return Promise.resolve(ATTENDANCE_PAGE);
  },
};

// Stands in for attendance-service's schedule routes. The request bodies are recorded so a test can show what reached it.
const SAVED_SCHEDULE_VERSION: WorkScheduleVersion = {
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
const SCHEDULE_VERSION_REQUEST = {
  workingWeekdays: [1, 3, 5],
  startTime: '08:30',
  endTime: '17:30',
  lateCheckinGraceMinutes: 10,
  earlyCheckoutGraceMinutes: 5,
  lateCheckoutGraceMinutes: 20,
  effectiveFrom: '2026-11-16',
};
const scheduleVersionCreateRequests: WorkScheduleVersionRequest[] = [];
const scheduleVersionUpdateRequests: {
  readonly versionId: string;
  readonly request: WorkScheduleVersionRequest;
}[] = [];
const workScheduleClientFake: IWorkScheduleClient = {
  getScheduleOverview: () =>
    Promise.reject(new Error('The route guard tests never read the schedule overview.')),
  createVersion: (user: AuthenticatedUser, request: WorkScheduleVersionRequest) => {
    forwardedUsers.push(user);
    scheduleVersionCreateRequests.push(request);
    return Promise.resolve(SAVED_SCHEDULE_VERSION);
  },
  updateVersion: (
    user: AuthenticatedUser,
    versionId: string,
    request: WorkScheduleVersionRequest,
  ) => {
    forwardedUsers.push(user);
    scheduleVersionUpdateRequests.push({ versionId, request });
    return Promise.resolve(SAVED_SCHEDULE_VERSION);
  },
};

// Stands in for attendance-service's calendar exception routes. The query and the request are recorded so a test can
// show what reached it.
const CALENDAR_DATE: WorkCalendarDate = {
  date: '2026-11-09',
  isWorkingDay: false,
  description: 'Public holiday',
};
const CALENDAR_DATE_PAGE: WorkCalendarDatePage = {
  items: [CALENDAR_DATE],
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
};
const calendarDateListQueries: WorkCalendarDateListQuery[] = [];
const calendarDateUpserts: { readonly date: string; readonly request: WorkCalendarDateRequest }[] =
  [];
const calendarDateDeletes: string[] = [];
const workCalendarDateClientFake: IWorkCalendarDateClient = {
  listDates: (user: AuthenticatedUser, query: WorkCalendarDateListQuery) => {
    forwardedUsers.push(user);
    calendarDateListQueries.push(query);
    return Promise.resolve(CALENDAR_DATE_PAGE);
  },
  upsertDate: (user: AuthenticatedUser, date: string, request: WorkCalendarDateRequest) => {
    forwardedUsers.push(user);
    calendarDateUpserts.push({ date, request });
    return Promise.resolve(CALENDAR_DATE);
  },
  deleteDate: (user: AuthenticatedUser, date: string) => {
    forwardedUsers.push(user);
    calendarDateDeletes.push(date);
    return Promise.resolve();
  },
};

@Controller('route-guard-tests/self-service')
class StubSelfServiceController {
  @Roles(Role.EMPLOYEE, Role.HR)
  @Get()
  getSelfServiceRoute(): { route: string } {
    return { route: 'self-service' };
  }
}

function encodeJsonSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// Signs a service token the way a calling service does (ES256, kid = caller, iss = sub = caller, aud = target).
function signServiceToken(keys: AuthKeySet, caller: ServiceName, target: ServiceName): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'ES256', typ: 'JWT', kid: caller }),
    encodeJsonSegment({
      iss: caller,
      sub: caller,
      aud: target,
      exp: Math.floor(Date.now() / 1000) + SERVICE_TOKEN_LIFETIME_SECONDS_FOR_CALLS,
    }),
  ].join('.');
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: servicePair(keys, caller).privateKeyPem, dsaEncoding: 'ieee-p1363' }, 'base64url');
  return `${signingInput}.${signature}`;
}

// The account ID is the token subject. The test reads it only to name the HR actor in an administration call.
function accountIdOf(accessToken: string): string {
  const payload = z
    .object({ sub: z.uuid() })
    .parse(JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')));
  return payload.sub;
}

// Signs a user token with the test user key, which only auth-service holds in production. The gateway
// verifies the signature, so a token for an account that does not exist reaches the account lookup.
function signUserTokenForAccount(keys: AuthKeySet, accountId: string, role: Role): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'RS256', typ: 'JWT' }),
    encodeJsonSegment({
      sub: accountId,
      role,
      iss: USER_JWT_ISSUER,
      aud: USER_JWT_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + SIGNED_TOKEN_LIFETIME_SECONDS,
    }),
  ].join('.');
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(keys.user.privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}

// The environment that auth-service starts with. It holds the user private key, which only it may hold.
function authServiceProcessEnvironment(
  keys: AuthKeySet,
  databaseUrl: string,
): Record<string, string> {
  return {
    NODE_ENV: 'test',
    BUSINESS_TIMEZONE: 'Asia/Jakarta',
    ...authEnvironmentFor(keys, ServiceName.AUTH_SERVICE),
    ...userJwtSigningEnvironmentFor(keys),
    RABBITMQ_URL: UNREACHABLE_BROKER_URL,
    AUTH_DATABASE_URL: databaseUrl,
    AUTH_BOOTSTRAP_HR_EMAIL: HR_EMAIL,
    AUTH_BOOTSTRAP_HR_PASSWORD: HR_PASSWORD,
  };
}

// Reads the body until the text holds the expected frame, and returns everything read so far. A frame that never
// arrives fails the spec with a message that names the buffering risk.
async function readUntilContains(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let received = '';
  while (!received.includes(expected)) {
    const chunk = await withRelayTimeout(reader.read(), 'the relayed frame');
    if (chunk.done) throw new Error('The stream ended before the expected frame arrived.');
    received += decoder.decode(chunk.value, { stream: true });
  }
  return received;
}

async function readToEnd(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let received = '';
  for (;;) {
    const chunk = await withRelayTimeout(reader.read(), 'the end of the stream');
    if (chunk.done) return received;
    received += decoder.decode(chunk.value, { stream: true });
  }
}

async function withRelayTimeout<TValue>(promise: Promise<TValue>, description: string) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(`Timed out waiting for ${description}. The gateway may be buffering the stream.`),
      );
    }, RELAY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function bodyReaderOf(response: Response): ReadableStreamDefaultReader<Uint8Array> {
  if (response.body === null) throw new Error('The stream answered without a body.');
  return response.body.getReader();
}

describe('api-gateway route guards through a running auth-service', () => {
  let container: StartedPostgreSqlContainer;
  let authService: RunningAuthService;
  let notificationService: NotificationServiceStub;
  let app: INestApplication;
  let gatewayUrl: string;
  let keys: AuthKeySet;
  let hrToken: string;
  let employeeToken: string;

  // Teardown still stops each resource when setup failed partway through.
  afterAll(async () => {
    await app?.close();
    await notificationService?.close();
    await authService?.stop();
    await container?.stop();
  }, SETUP_TIMEOUT_MS);

  afterEach(() => {
    createEmployeeOutcome = DEFAULT_CREATE_OUTCOME;
    updateEmployeeOutcome = DEFAULT_UPDATE_OUTCOME;
    notificationService.answerInbox(EMPTY_INBOX_ANSWER);
  });

  beforeAll(async () => {
    keys = generateAuthKeySet();
    container = await new PostgreSqlContainer('postgres:18').start();
    authService = await startAuthServiceProcess(
      authServiceProcessEnvironment(keys, container.getConnectionUri()),
    );
    notificationService = await startNotificationServiceStub();
    const config = parseConfig(ApiGatewayConfigSchema, {
      BUSINESS_TIMEZONE: 'Asia/Jakarta',
      ...authEnvironmentFor(keys, ServiceName.API_GATEWAY),
      ...userJwtVerifierEnvironmentFor(keys),
      AUTH_SERVICE_INTERNAL_URL: authService.baseUrl,
      EMPLOYEE_SERVICE_INTERNAL_URL: 'http://employee-service:3000',
      ATTENDANCE_SERVICE_INTERNAL_URL: 'http://attendance-service:3000',
      NOTIFICATION_SERVICE_INTERNAL_URL: notificationService.baseUrl,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
      controllers: [StubHrController, StubSelfServiceController],
    })
      .overrideProvider(EMPLOYEE_SERVICE_CLIENT)
      .useValue(employeeServiceFake)
      .overrideProvider(ATTENDANCE_SERVICE_CLIENT)
      .useValue(attendanceServiceFake)
      .overrideProvider(WORK_SCHEDULE_CLIENT)
      .useValue(workScheduleClientFake)
      .overrideProvider(WORK_CALENDAR_DATE_CLIENT)
      .useValue(workCalendarDateClientFake)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    // The stream test uses fetch, which needs a real socket. Supertest keeps using the server handler directly.
    await app.listen(0, '127.0.0.1');
    gatewayUrl = await app.getUrl();

    // The employee copies the bootstrap HR password hash, so it can sign in through the gateway without
    // this test calling argon2 directly.
    await insertEmployeeAccount(EMPLOYEE_ACCOUNT_ID, EMPLOYEE_EMAIL);
    hrToken = await signIn(HR_EMAIL, HR_PASSWORD, Portal.HR);
    employeeToken = await signIn(EMPLOYEE_EMAIL, HR_PASSWORD, Portal.EMPLOYEE);
  }, SETUP_TIMEOUT_MS);

  async function runSql(statement: string): Promise<void> {
    const result = await container.exec([
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      container.getUsername(),
      '-d',
      container.getDatabase(),
      '-c',
      statement,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`psql failed with exit code ${result.exitCode}: ${result.output}`);
    }
  }

  // Inserts nothing when the bootstrap HR account is missing, so the sign-in that follows fails loudly.
  async function insertEmployeeAccount(accountId: string, email: string): Promise<void> {
    await runSql(
      `insert into accounts (id, company_email, password_hash, role_id, is_active)
       select '${accountId}', '${email}', password_hash,
              (select id from master_roles where code = 'EMPLOYEE'), true
       from accounts where company_email = '${HR_EMAIL}'`,
    );
  }

  async function signIn(email: string, password: string, portal: Portal): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(LOGIN_PATH)
      .send({ email, password, portal })
      .expect(200);
    return loginResponseSchema.parse(response.body).accessToken;
  }

  function getWithToken(path: string, accessToken: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`);
  }

  function postWithToken(path: string, accessToken: string, body: unknown) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body as object);
  }

  function putWithToken(path: string, accessToken: string, body: unknown) {
    return request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body as object);
  }

  function deleteWithToken(path: string, accessToken: string) {
    return request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${accessToken}`);
  }

  function patchWithToken(path: string, accessToken: string, body: unknown) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body as object);
  }

  function putPhotoWithToken(accessToken: string, bytes: Buffer) {
    return request(app.getHttpServer())
      .put(OWN_PHOTO_PATH)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('photo', bytes, { filename: 'photo.png', contentType: 'image/png' });
  }

  // The photo answer is bytes, so the body is collected rather than parsed.
  function getPhotoWithToken(accessToken: string, photoPath: string = OWN_PHOTO_PATH) {
    return request(app.getHttpServer())
      .get(photoPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  it(
    'should return 401 UNAUTHORIZED on the HR route when no bearer token is sent',
    async () => {
      const response = await request(app.getHttpServer()).get(HR_ROUTE_PATH).expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Sign in to continue.',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the HR route when the bearer token is not a user token',
    async () => {
      const response = await request(app.getHttpServer())
        .get(HR_ROUTE_PATH)
        .set('Authorization', 'Bearer not-a-user-token')
        .expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN when an employee token calls the HR route',
    async () => {
      const response = await getWithToken(HR_ROUTE_PATH, employeeToken).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 when an employee token calls the self-service route',
    async () => {
      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, employeeToken).expect(200);

      expect(response.body).toEqual({ route: 'self-service' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 when an HR token calls the HR route and the self-service route',
    async () => {
      await getWithToken(HR_ROUTE_PATH, hrToken).expect(200);
      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, hrToken).expect(200);

      expect(response.body).toEqual({ route: 'self-service' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the employee account from /auth/me when the employee token is valid',
    async () => {
      const response = await getWithToken(CURRENT_ACCOUNT_PATH, employeeToken).expect(200);

      expect(response.body).toEqual({
        id: EMPLOYEE_ACCOUNT_ID,
        email: EMPLOYEE_EMAIL,
        role: Role.EMPLOYEE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it.each([POSITIONS_PATH, EMPLOYEE_STATUSES_PATH])(
    'should return 401 UNAUTHORIZED on %s when no bearer token is sent, without calling employee-service',
    async (path) => {
      forwardedUsers.length = 0;

      const response = await request(app.getHttpServer()).get(path).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it.each([POSITIONS_PATH, EMPLOYEE_STATUSES_PATH])(
    'should return 403 FORBIDDEN on %s when an employee token is sent, without calling employee-service',
    async (path) => {
      forwardedUsers.length = 0;

      const response = await getWithToken(path, employeeToken).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 201 with the version and forward the HR token when an HR token creates a schedule version',
    async () => {
      forwardedUsers.length = 0;
      scheduleVersionCreateRequests.length = 0;

      const response = await postWithToken(
        WORK_SCHEDULES_PATH,
        hrToken,
        SCHEDULE_VERSION_REQUEST,
      ).expect(201);

      expect(response.body).toEqual(SAVED_SCHEDULE_VERSION);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(scheduleVersionCreateRequests).toEqual([SCHEDULE_VERSION_REQUEST]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN without calling attendance-service when an employee token creates a schedule version',
    async () => {
      forwardedUsers.length = 0;
      scheduleVersionCreateRequests.length = 0;

      const response = await postWithToken(
        WORK_SCHEDULES_PATH,
        employeeToken,
        SCHEDULE_VERSION_REQUEST,
      ).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(scheduleVersionCreateRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED without calling attendance-service when no token creates a schedule version',
    async () => {
      forwardedUsers.length = 0;
      scheduleVersionCreateRequests.length = 0;

      const response = await request(app.getHttpServer())
        .post(WORK_SCHEDULES_PATH)
        .send(SCHEDULE_VERSION_REQUEST)
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(scheduleVersionCreateRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED without calling attendance-service when the create carries effectiveUntil',
    async () => {
      forwardedUsers.length = 0;
      scheduleVersionCreateRequests.length = 0;

      const response = await postWithToken(WORK_SCHEDULES_PATH, hrToken, {
        ...SCHEDULE_VERSION_REQUEST,
        effectiveUntil: '2026-12-01',
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(scheduleVersionCreateRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 with the version and forward the HR token when an HR token edits a schedule version',
    async () => {
      forwardedUsers.length = 0;
      scheduleVersionUpdateRequests.length = 0;

      const response = await putWithToken(
        `${WORK_SCHEDULES_PATH}/${SAVED_SCHEDULE_VERSION.id}`,
        hrToken,
        SCHEDULE_VERSION_REQUEST,
      ).expect(200);

      expect(response.body).toEqual(SAVED_SCHEDULE_VERSION);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(scheduleVersionUpdateRequests).toEqual([
        { versionId: SAVED_SCHEDULE_VERSION.id, request: SCHEDULE_VERSION_REQUEST },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN without calling attendance-service when an employee token edits a schedule version',
    async () => {
      forwardedUsers.length = 0;
      scheduleVersionUpdateRequests.length = 0;

      await putWithToken(
        `${WORK_SCHEDULES_PATH}/${SAVED_SCHEDULE_VERSION.id}`,
        employeeToken,
        SCHEDULE_VERSION_REQUEST,
      ).expect(403);

      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(scheduleVersionUpdateRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the positions and forward the HR token when an HR token calls the positions route',
    async () => {
      forwardedUsers.length = 0;

      const response = await getWithToken(POSITIONS_PATH, hrToken).expect(200);

      expect(response.body).toEqual(POSITIONS);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the employee statuses and forward the HR token when an HR token calls the statuses route',
    async () => {
      forwardedUsers.length = 0;

      const response = await getWithToken(EMPLOYEE_STATUSES_PATH, hrToken).expect(200);

      expect(response.body).toEqual(EMPLOYEE_STATUSES);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { caller: 'an employee', token: () => employeeToken },
    { caller: 'an HR account', token: () => hrToken },
  ])(
    'should return the own profile and forward the caller token when $caller calls the own profile route',
    async ({ token }) => {
      forwardedUsers.length = 0;

      const response = await getWithToken(OWN_PROFILE_PATH, token()).expect(200);

      expect(response.body).toEqual(OWN_PROFILE);
      expect(forwardedAccountIds()).toEqual([token()].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the own profile route when no bearer token is sent, without calling employee-service',
    async () => {
      forwardedUsers.length = 0;

      const response = await request(app.getHttpServer()).get(OWN_PROFILE_PATH).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { caller: 'an employee', token: () => employeeToken },
    { caller: 'an HR account', token: () => hrToken },
  ])(
    'should return the updated profile and forward the caller token when $caller updates the phone number',
    async ({ token }) => {
      forwardedUsers.length = 0;
      profileUpdates.length = 0;

      const response = await patchWithToken(OWN_PROFILE_PATH, token(), {
        phoneNumber: '  +6281234567890  ',
      }).expect(200);

      expect(response.body).toEqual({ ...OWN_PROFILE, phoneNumber: '+6281234567890' });
      expect(profileUpdates).toEqual([{ phoneNumber: '+6281234567890' }]);
      expect(forwardedAccountIds()).toEqual([token()].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { condition: 'the name is sent', body: { phoneNumber: '+6281234567890', name: 'Changed' } },
    {
      condition: 'the email is sent',
      body: { phoneNumber: '+6281234567890', email: 'changed@dexa.test' },
    },
    {
      condition: 'the position is sent',
      body: { phoneNumber: '+6281234567890', positionId: randomUUID() },
    },
    {
      condition: 'the profile status is sent',
      body: { phoneNumber: '+6281234567890', profileStatus: 'COMPLETE' },
    },
    { condition: 'the phone number is not a phone number', body: { phoneNumber: 'call me' } },
  ])(
    'should return 400 VALIDATION_FAILED without calling employee-service when $condition',
    async ({ body }) => {
      forwardedUsers.length = 0;
      profileUpdates.length = 0;

      const response = await patchWithToken(OWN_PROFILE_PATH, employeeToken, body).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(profileUpdates).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the phone update route when no bearer token is sent, without calling employee-service',
    async () => {
      forwardedUsers.length = 0;

      const response = await request(app.getHttpServer())
        .patch(OWN_PROFILE_PATH)
        .send({ phoneNumber: '+6281234567890' })
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should store the uploaded bytes and forward the employee token when the employee uploads a photo',
    async () => {
      forwardedUsers.length = 0;
      photoUploads.length = 0;
      const upload = Buffer.from('uploaded photo bytes');

      const response = await putPhotoWithToken(employeeToken, upload).expect(200);

      expect(response.body).toEqual(OWN_PROFILE);
      expect(forwardedAccountIds()).toEqual([employeeToken].map(accountIdOf));
      expect(photoUploads).toHaveLength(1);
      expect(photoUploads[0]?.equals(upload)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 413 PHOTO_TOO_LARGE without calling employee-service when the declared length is over the limit',
    async () => {
      forwardedUsers.length = 0;
      photoUploads.length = 0;
      const oversized = Buffer.alloc(MAX_PHOTO_BYTES + PHOTO_MULTIPART_OVERHEAD_BYTES + 1, 0x61);

      const response = await putPhotoWithToken(employeeToken, oversized).expect(413);

      expect(response.body).toMatchObject({ statusCode: 413, code: 'PHOTO_TOO_LARGE' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(photoUploads).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the photo upload route when no bearer token is sent, without calling employee-service',
    async () => {
      forwardedUsers.length = 0;
      photoUploads.length = 0;

      const response = await request(app.getHttpServer())
        .put(OWN_PHOTO_PATH)
        .attach('photo', Buffer.from('uploaded photo bytes'), 'photo.png')
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(photoUploads).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the stored bytes with the private photo headers and forward the employee token when the employee fetches the photo',
    async () => {
      forwardedUsers.length = 0;

      const response = await getPhotoWithToken(employeeToken).expect(200);

      expect(response.headers['content-type']).toBe(PHOTO_CONTENT_TYPE);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const body: unknown = response.body;
      expect(Buffer.isBuffer(body) && body.equals(STORED_PHOTO_BYTES)).toBe(true);
      expect(forwardedAccountIds()).toEqual([employeeToken].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED on the photo fetch route when no bearer token is sent, without calling employee-service',
    async () => {
      forwardedUsers.length = 0;

      const response = await request(app.getHttpServer()).get(OWN_PHOTO_PATH).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 201 with the employee and forward the HR token when an HR token creates an employee',
    async () => {
      forwardedUsers.length = 0;
      createRequests.length = 0;

      const response = await postWithToken(
        CREATE_EMPLOYEE_PATH,
        hrToken,
        CREATE_EMPLOYEE_BODY,
      ).expect(201);

      expect(response.body).toEqual(NEW_EMPLOYEE);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(createRequests).toEqual([
        { ...CREATE_EMPLOYEE_BODY, name: 'Bima Saputra', email: 'bima.saputra@dexa.test' },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN without calling employee-service when an employee token creates an employee',
    async () => {
      forwardedUsers.length = 0;
      createRequests.length = 0;

      const response = await postWithToken(
        CREATE_EMPLOYEE_PATH,
        employeeToken,
        CREATE_EMPLOYEE_BODY,
      ).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(createRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED without calling employee-service when no bearer token is sent to the create route',
    async () => {
      forwardedUsers.length = 0;

      const response = await request(app.getHttpServer())
        .post(CREATE_EMPLOYEE_PATH)
        .send(CREATE_EMPLOYEE_BODY)
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED without calling employee-service when the create body carries an extra field',
    async () => {
      forwardedUsers.length = 0;

      const response = await postWithToken(CREATE_EMPLOYEE_PATH, hrToken, {
        ...CREATE_EMPLOYEE_BODY,
        profileStatus: 'COMPLETE',
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 503 with the code, message, and details unchanged when employee-service cannot finish the create',
    async () => {
      forwardedUsers.length = 0;
      const message =
        'Employee creation did not finish. Retry with the same operation ID to finish it.';
      createEmployeeOutcome = () =>
        Promise.reject(
          new DependencyUnavailableError(ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE, message, {
            details: INCOMPLETE_DETAILS,
          }),
        );

      const response = await postWithToken(
        CREATE_EMPLOYEE_PATH,
        hrToken,
        CREATE_EMPLOYEE_BODY,
      ).expect(503);

      expect(response.body).toEqual({
        statusCode: 503,
        code: ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE,
        message,
        details: INCOMPLETE_DETAILS,
      });
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 with the employee and forward the HR token when HR updates an employee',
    async () => {
      forwardedUsers.length = 0;
      updateRequests.length = 0;

      const response = await patchWithToken(`/api/v1/employees/${EMPLOYEE_ACCOUNT_ID}`, hrToken, {
        name: 'Bima Saputra',
      }).expect(200);

      expect(response.body).toEqual(UPDATED_EMPLOYEE);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(updateRequests).toEqual([
        { accountId: EMPLOYEE_ACCOUNT_ID, request: { name: 'Bima Saputra' } },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 without calling employee-service when an employee token updates an employee',
    async () => {
      forwardedUsers.length = 0;
      updateRequests.length = 0;

      const response = await patchWithToken(
        `/api/v1/employees/${EMPLOYEE_ACCOUNT_ID}`,
        employeeToken,
        {
          name: 'Bima Saputra',
        },
      ).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(updateRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 without calling employee-service when no bearer token is sent to the update route',
    async () => {
      forwardedUsers.length = 0;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/employees/${EMPLOYEE_ACCOUNT_ID}`)
        .send({ name: 'Bima Saputra' })
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    {
      condition: 'the account ID is not a UUID',
      path: '/api/v1/employees/not-a-uuid',
      body: { name: 'Bima' },
    },
    {
      condition: 'the body is empty',
      path: `/api/v1/employees/${EMPLOYEE_ACCOUNT_ID}`,
      body: {},
    },
    {
      condition: 'the body carries an extra field',
      path: `/api/v1/employees/${EMPLOYEE_ACCOUNT_ID}`,
      body: { name: 'Bima', profileStatus: 'COMPLETE' },
    },
  ])(
    'should return 400 without calling employee-service when $condition',
    async ({ path, body }) => {
      forwardedUsers.length = 0;
      updateRequests.length = 0;

      const response = await patchWithToken(path, hrToken, body).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(updateRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 503 with the code, message, and details unchanged when employee-service stops the update after a save',
    async () => {
      forwardedUsers.length = 0;
      updateEmployeeOutcome = () =>
        Promise.reject(
          new DependencyUnavailableError(
            ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE,
            UPDATE_INCOMPLETE_MESSAGE,
            { details: UPDATE_INCOMPLETE_DETAILS },
          ),
        );

      const response = await patchWithToken(`/api/v1/employees/${EMPLOYEE_ACCOUNT_ID}`, hrToken, {
        name: 'Bima Saputra',
      }).expect(503);

      expect(response.body).toEqual({
        statusCode: 503,
        code: ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE,
        message: UPDATE_INCOMPLETE_MESSAGE,
        details: UPDATE_INCOMPLETE_DETAILS,
      });
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should still route PATCH employees/me to the self-service phone update when an HR token calls it',
    async () => {
      forwardedUsers.length = 0;
      profileUpdates.length = 0;
      updateRequests.length = 0;

      await patchWithToken(OWN_PROFILE_PATH, hrToken, { phoneNumber: '+6281234567890' }).expect(
        200,
      );

      expect(profileUpdates).toEqual([{ phoneNumber: '+6281234567890' }]);
      expect(updateRequests).toEqual([]);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 ACCOUNT_DISABLED on the next request after HR deactivates the account through the administration route',
    async () => {
      const accountId = randomUUID();
      await insertEmployeeAccount(accountId, ADMIN_DEACTIVATED_EMAIL);
      const token = await signIn(ADMIN_DEACTIVATED_EMAIL, HR_PASSWORD, Portal.EMPLOYEE);
      await getWithToken(SELF_SERVICE_ROUTE_PATH, token).expect(200);

      // employee-service makes this call when HR sets the status to INACTIVE. The token is the service's own.
      const serviceToken = signServiceToken(
        keys,
        ServiceName.EMPLOYEE_SERVICE,
        ServiceName.AUTH_SERVICE,
      );
      const answer = await request(authService.baseUrl)
        .put(ACCOUNT_STATUS_PATH(accountId))
        .set('Authorization', `Bearer ${serviceToken}`)
        .send({ actorAccountId: accountIdOf(hrToken), isActive: false })
        .expect(200);
      expect(answer.body).toEqual({ isActive: false });

      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, token).expect(401);
      expect(response.body).toEqual(ACCOUNT_DISABLED_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it('should return 200 from the health route without a token', async () => {
    const response = await request(app.getHttpServer()).get(HEALTH_PATH).expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it(
    'should return a bearer token from login when no token is sent',
    async () => {
      const response = await request(app.getHttpServer())
        .post(LOGIN_PATH)
        .send({ email: HR_EMAIL, password: HR_PASSWORD, portal: Portal.HR })
        .expect(200);

      expect(response.body).toMatchObject({ tokenType: 'Bearer', account: { role: Role.HR } });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 ACCOUNT_DISABLED on the next request after the account is deactivated',
    async () => {
      const accountId = randomUUID();
      await insertEmployeeAccount(accountId, DEACTIVATED_EMAIL);
      const token = await signIn(DEACTIVATED_EMAIL, HR_PASSWORD, Portal.EMPLOYEE);
      await getWithToken(SELF_SERVICE_ROUTE_PATH, token).expect(200);

      await runSql(`update accounts set is_active = false where id = '${accountId}'`);
      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, token).expect(401);

      expect(response.body).toEqual(ACCOUNT_DISABLED_BODY);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED when the token names an account that does not exist',
    async () => {
      const token = signUserTokenForAccount(keys, randomUUID(), Role.EMPLOYEE);

      const response = await getWithToken(SELF_SERVICE_ROUTE_PATH, token).expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Sign in to continue.',
      });
    },
    TEST_TIMEOUT_MS,
  );
  it(
    'should return the page and forward the query and the HR token when HR lists employees',
    async () => {
      forwardedUsers.length = 0;
      listQueries.length = 0;

      const response = await getWithToken(
        `${EMPLOYEE_LIST_PATH}?page=2&pageSize=5&q=%20%20Kusuma%20`,
        hrToken,
      ).expect(200);

      expect(response.body).toEqual(EMPLOYEE_LIST_PAGE);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(listQueries).toEqual([{ page: 2, pageSize: 5, q: 'Kusuma' }]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 without calling employee-service when an employee token lists employees',
    async () => {
      forwardedUsers.length = 0;
      listQueries.length = 0;

      const response = await getWithToken(EMPLOYEE_LIST_PATH, employeeToken).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(listQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 without calling employee-service when the list query has an unknown key',
    async () => {
      forwardedUsers.length = 0;
      listQueries.length = 0;

      const response = await getWithToken(`${EMPLOYEE_LIST_PATH}?sort=name`, hrToken).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(listQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the HR photo bytes with the private photo headers and forward the HR token',
    async () => {
      forwardedUsers.length = 0;
      requestedPhotoAccountIds.length = 0;

      const response = await getPhotoWithToken(
        hrToken,
        EMPLOYEE_PHOTO_PATH(LISTED_EMPLOYEE_ACCOUNT_ID),
      ).expect(200);

      expect(response.headers['content-type']).toBe(PHOTO_CONTENT_TYPE);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const body: unknown = response.body;
      expect(Buffer.isBuffer(body) && body.equals(LISTED_EMPLOYEE_PHOTO_BYTES)).toBe(true);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(requestedPhotoAccountIds).toEqual([LISTED_EMPLOYEE_ACCOUNT_ID]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 without calling employee-service when an employee asks for another employee photo',
    async () => {
      forwardedUsers.length = 0;
      requestedPhotoAccountIds.length = 0;

      const response = await getWithToken(
        EMPLOYEE_PHOTO_PATH(LISTED_EMPLOYEE_ACCOUNT_ID),
        employeeToken,
      ).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(requestedPhotoAccountIds).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 without calling employee-service when the photo account ID is not a UUID',
    async () => {
      forwardedUsers.length = 0;
      requestedPhotoAccountIds.length = 0;

      const response = await getWithToken(EMPLOYEE_PHOTO_PATH('not-a-uuid'), hrToken).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(requestedPhotoAccountIds).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the thumbnails and forward the HR token when HR asks for a page of thumbnails',
    async () => {
      forwardedUsers.length = 0;
      photoThumbnailRequests.length = 0;
      const thumbnailRequest = { accountIds: [LISTED_EMPLOYEE_ACCOUNT_ID] };

      const response = await postWithToken(THUMBNAIL_PATH, hrToken, thumbnailRequest).expect(200);

      expect(response.body).toEqual(PHOTO_THUMBNAIL_PAGE);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(photoThumbnailRequests).toEqual([thumbnailRequest]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 without calling employee-service when an employee token asks for thumbnails',
    async () => {
      forwardedUsers.length = 0;
      photoThumbnailRequests.length = 0;

      const response = await postWithToken(THUMBNAIL_PATH, employeeToken, {
        accountIds: [LISTED_EMPLOYEE_ACCOUNT_ID],
      }).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(photoThumbnailRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 without calling employee-service when the thumbnail request repeats an account ID',
    async () => {
      forwardedUsers.length = 0;
      photoThumbnailRequests.length = 0;

      const response = await postWithToken(THUMBNAIL_PATH, hrToken, {
        accountIds: [LISTED_EMPLOYEE_ACCOUNT_ID, LISTED_EMPLOYEE_ACCOUNT_ID],
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(photoThumbnailRequests).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should keep the static me routes on their own handlers when HR calls them',
    async () => {
      forwardedUsers.length = 0;
      requestedPhotoAccountIds.length = 0;

      const profile = await getWithToken(OWN_PROFILE_PATH, hrToken).expect(200);
      const photo = await getPhotoWithToken(hrToken).expect(200);

      expect(profile.body).toEqual(OWN_PROFILE);
      const body: unknown = photo.body;
      expect(Buffer.isBuffer(body) && body.equals(STORED_PHOTO_BYTES)).toBe(true);
      expect(requestedPhotoAccountIds).toEqual([]);
      expect(forwardedAccountIds()).toEqual([hrToken, hrToken].map(accountIdOf));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 204 and forward the HR token when an HR token deletes a calendar date',
    async () => {
      forwardedUsers.length = 0;
      calendarDateDeletes.length = 0;

      const response = await deleteWithToken(
        `${WORK_CALENDAR_DATES_PATH}/2026-11-09`,
        hrToken,
      ).expect(204);

      expect(response.text).toBe('');
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(calendarDateDeletes).toEqual(['2026-11-09']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN without calling attendance-service when an employee token deletes a calendar date',
    async () => {
      forwardedUsers.length = 0;
      calendarDateDeletes.length = 0;

      const response = await deleteWithToken(
        `${WORK_CALENDAR_DATES_PATH}/2026-11-09`,
        employeeToken,
      ).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(calendarDateDeletes).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED without calling attendance-service when the delete date is not an ISO date',
    async () => {
      forwardedUsers.length = 0;
      calendarDateDeletes.length = 0;

      const response = await deleteWithToken(
        `${WORK_CALENDAR_DATES_PATH}/next-monday`,
        hrToken,
      ).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(calendarDateDeletes).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the page and forward the range, page and HR token when HR lists calendar dates',
    async () => {
      forwardedUsers.length = 0;
      calendarDateListQueries.length = 0;

      const response = await getWithToken(
        `${WORK_CALENDAR_DATES_PATH}?from=2026-11-01&to=2026-11-30&page=1&pageSize=20`,
        hrToken,
      ).expect(200);

      expect(response.body).toEqual(CALENDAR_DATE_PAGE);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(calendarDateListQueries).toEqual([
        { from: '2026-11-01', to: '2026-11-30', page: 1, pageSize: 20 },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN without calling attendance-service when an employee token lists calendar dates',
    async () => {
      forwardedUsers.length = 0;
      calendarDateListQueries.length = 0;

      const response = await getWithToken(
        `${WORK_CALENDAR_DATES_PATH}?from=2026-11-01&to=2026-11-30`,
        employeeToken,
      ).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(calendarDateListQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 UNAUTHORIZED without calling attendance-service when no token lists calendar dates',
    async () => {
      forwardedUsers.length = 0;
      calendarDateListQueries.length = 0;

      const response = await request(app.getHttpServer())
        .get(`${WORK_CALENDAR_DATES_PATH}?from=2026-11-01&to=2026-11-30`)
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(calendarDateListQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED without calling attendance-service when the list has no from bound',
    async () => {
      forwardedUsers.length = 0;
      calendarDateListQueries.length = 0;

      const response = await getWithToken(
        `${WORK_CALENDAR_DATES_PATH}?to=2026-11-30`,
        hrToken,
      ).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(calendarDateListQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 200 with the exception and forward the HR token when an HR token saves a calendar date',
    async () => {
      forwardedUsers.length = 0;
      calendarDateUpserts.length = 0;

      const response = await putWithToken(`${WORK_CALENDAR_DATES_PATH}/2026-11-09`, hrToken, {
        isWorkingDay: false,
        description: 'Public holiday',
      }).expect(200);

      expect(response.body).toEqual(CALENDAR_DATE);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(calendarDateUpserts).toEqual([
        {
          date: '2026-11-09',
          request: { isWorkingDay: false, description: 'Public holiday' },
        },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 FORBIDDEN without calling attendance-service when an employee token saves a calendar date',
    async () => {
      forwardedUsers.length = 0;
      calendarDateUpserts.length = 0;

      const response = await putWithToken(`${WORK_CALENDAR_DATES_PATH}/2026-11-09`, employeeToken, {
        isWorkingDay: false,
      }).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(calendarDateUpserts).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 VALIDATION_FAILED without calling attendance-service when the save carries the date in its body',
    async () => {
      forwardedUsers.length = 0;
      calendarDateUpserts.length = 0;

      const response = await putWithToken(`${WORK_CALENDAR_DATES_PATH}/2026-11-09`, hrToken, {
        isWorkingDay: false,
        date: '2026-11-10',
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(calendarDateUpserts).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return the page and forward the query and the HR token when HR lists attendance',
    async () => {
      forwardedUsers.length = 0;
      attendanceListQueries.length = 0;

      const response = await getWithToken(
        `${ATTENDANCE_LIST_PATH}?from=2026-11-01&to=2026-11-30&employeeId=${ATTENDANCE_EMPLOYEE_ACCOUNT_ID}&page=2&pageSize=5`,
        hrToken,
      ).expect(200);

      expect(response.body).toEqual(ATTENDANCE_PAGE);
      expect(forwardedAccountIds()).toEqual([hrToken].map(accountIdOf));
      expect(attendanceListQueries).toEqual([
        {
          from: '2026-11-01',
          to: '2026-11-30',
          employeeId: ATTENDANCE_EMPLOYEE_ACCOUNT_ID,
          page: 2,
          pageSize: 5,
        },
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 403 without calling attendance-service when an employee token lists attendance',
    async () => {
      forwardedUsers.length = 0;
      attendanceListQueries.length = 0;

      const response = await getWithToken(ATTENDANCE_LIST_PATH, employeeToken).expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Your role cannot use this action.',
      });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(attendanceListQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 without calling attendance-service when the attendance query has an unknown key',
    async () => {
      forwardedUsers.length = 0;
      attendanceListQueries.length = 0;

      const response = await getWithToken(`${ATTENDANCE_LIST_PATH}?sort=name`, hrToken).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(attendanceListQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 without calling attendance-service when HR patches an attendance record',
    async () => {
      forwardedUsers.length = 0;
      attendanceListQueries.length = 0;

      await patchWithToken(ATTENDANCE_RECORD_PATH, hrToken, {
        clockInAt: '2026-11-02T02:00:00Z',
      }).expect(404);

      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(attendanceListQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 404 without calling attendance-service when HR deletes an attendance record',
    async () => {
      forwardedUsers.length = 0;
      attendanceListQueries.length = 0;

      await request(app.getHttpServer())
        .delete(ATTENDANCE_RECORD_PATH)
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(404);

      expect(forwardedAccountIds()).toEqual([].map(accountIdOf));
      expect(attendanceListQueries).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  describe('HR notification stream', () => {
    it(
      'should relay each frame as soon as notification-service writes it, with a gateway token for the HR user',
      async () => {
        const response = await fetch(`${gatewayUrl}${NOTIFICATION_STREAM_PATH}`, {
          headers: { Authorization: `Bearer ${hrToken}` },
        });
        const upstream: UpstreamStream = await notificationService.nextStream();
        const reader = bodyReaderOf(response);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
        expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
        expect(response.headers.get('x-accel-buffering')).toBe('no');
        expect(
          verifyGatewayToken(keys, upstream.authorization, ServiceName.NOTIFICATION_SERVICE),
        ).toEqual({
          accountId: accountIdOf(hrToken),
          role: Role.HR,
        });

        // The second frame is written only after the first has reached the browser, so a gateway that buffers the
        // upstream answer would hold the first frame until the relay timeout.
        upstream.write(FIRST_NOTIFICATION_FRAME);
        expect(await readUntilContains(reader, FIRST_NOTIFICATION_FRAME)).toBe(
          FIRST_NOTIFICATION_FRAME,
        );
        upstream.write(SECOND_NOTIFICATION_FRAME);
        upstream.end();
        expect(await readToEnd(reader)).toBe(SECOND_NOTIFICATION_FRAME);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should close the upstream connection when the browser leaves the stream',
      async () => {
        const browser = new AbortController();
        const response = await fetch(`${gatewayUrl}${NOTIFICATION_STREAM_PATH}`, {
          headers: { Authorization: `Bearer ${hrToken}` },
          signal: browser.signal,
        });
        const upstream = await notificationService.nextStream();
        upstream.write(FIRST_NOTIFICATION_FRAME);
        await readUntilContains(bodyReaderOf(response), FIRST_NOTIFICATION_FRAME);

        browser.abort();

        await withRelayTimeout(upstream.closed, 'the gateway to close the upstream connection');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 403 without calling notification-service when an employee token opens the stream',
      async () => {
        const requestsBefore = notificationService.requestCount();

        await getWithToken(NOTIFICATION_STREAM_PATH, employeeToken).expect(403);

        expect(notificationService.requestCount()).toBe(requestsBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 401 without calling notification-service when no bearer token is sent',
      async () => {
        const requestsBefore = notificationService.requestCount();

        await request(app.getHttpServer()).get(NOTIFICATION_STREAM_PATH).expect(401);

        expect(notificationService.requestCount()).toBe(requestsBefore);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('HR notification inbox', () => {
    // The gateway forwards each inbox call as its own request, so a test reads only the calls made after its start.
    function inboxCallsSince(before: number) {
      return notificationService.inboxRequests().slice(before);
    }

    function singleCallOf(calls: ReturnType<typeof inboxCallsSince>) {
      expect(calls).toHaveLength(1);
      const [call] = calls;
      if (call === undefined) throw new Error('The gateway forwarded no inbox request.');
      return call;
    }

    it(
      'should forward the limit and cursor with a gateway token for the HR user, and return the page',
      async () => {
        notificationService.answerInbox({ status: 200, body: INBOX_PAGE });
        const before = notificationService.inboxRequests().length;

        const response = await getWithToken(
          `${INBOX_LIST_PATH}?limit=5&cursor=${INBOX_CURSOR}`,
          hrToken,
        ).expect(200);

        expect(response.body).toEqual(INBOX_PAGE);
        const call = singleCallOf(inboxCallsSince(before));
        const forwardedUrl = new URL(call.url, 'http://notification-service.stub');
        expect(call.method).toBe('GET');
        expect(forwardedUrl.pathname).toBe(INBOX_LIST_PATH);
        expect(forwardedUrl.searchParams.get('limit')).toBe('5');
        expect(forwardedUrl.searchParams.get('cursor')).toBe(INBOX_CURSOR);
        expect(
          verifyGatewayToken(keys, call.authorization, ServiceName.NOTIFICATION_SERVICE),
        ).toEqual({ accountId: accountIdOf(hrToken), role: Role.HR });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should forward the unread count request with a gateway token for the HR user',
      async () => {
        notificationService.answerInbox({ status: 200, body: { unreadCount: 4 } });
        const before = notificationService.inboxRequests().length;

        const response = await getWithToken(INBOX_UNREAD_COUNT_PATH, hrToken).expect(200);

        expect(response.body).toEqual({ unreadCount: 4 });
        const call = singleCallOf(inboxCallsSince(before));
        expect(new URL(call.url, 'http://notification-service.stub').pathname).toBe(
          INBOX_UNREAD_COUNT_PATH,
        );
        expect(
          verifyGatewayToken(keys, call.authorization, ServiceName.NOTIFICATION_SERVICE),
        ).toEqual({ accountId: accountIdOf(hrToken), role: Role.HR });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should forward the mark-read once as a POST and return the notification',
      async () => {
        notificationService.answerInbox({ status: 200, body: INBOX_NOTIFICATION });
        const before = notificationService.inboxRequests().length;

        const response = await request(app.getHttpServer())
          .post(INBOX_READ_PATH)
          .set('Authorization', `Bearer ${hrToken}`)
          .expect(200);

        expect(response.body).toEqual(INBOX_NOTIFICATION);
        const call = singleCallOf(inboxCallsSince(before));
        expect(call.method).toBe('POST');
        expect(new URL(call.url, 'http://notification-service.stub').pathname).toBe(
          INBOX_READ_PATH,
        );
        expect(
          verifyGatewayToken(keys, call.authorization, ServiceName.NOTIFICATION_SERVICE),
        ).toEqual({ accountId: accountIdOf(hrToken), role: Role.HR });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should retry a failed list read twice, then answer 503',
      async () => {
        notificationService.answerInbox({
          status: 500,
          body: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal error.' },
        });
        const before = notificationService.inboxRequests().length;

        const response = await getWithToken(INBOX_LIST_PATH, hrToken).expect(503);

        expect(response.body).toMatchObject({ statusCode: 503, code: 'DEPENDENCY_UNAVAILABLE' });
        expect(inboxCallsSince(before)).toHaveLength(3);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should not retry a failed mark-read, because a repeated write is not a safe retry',
      async () => {
        notificationService.answerInbox({
          status: 500,
          body: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal error.' },
        });
        const before = notificationService.inboxRequests().length;

        await request(app.getHttpServer())
          .post(INBOX_READ_PATH)
          .set('Authorization', `Bearer ${hrToken}`)
          .expect(503);

        expect(inboxCallsSince(before)).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 403 without calling notification-service when an employee token lists the inbox',
      async () => {
        const requestsBefore = notificationService.requestCount();

        await getWithToken(INBOX_LIST_PATH, employeeToken).expect(403);

        expect(notificationService.requestCount()).toBe(requestsBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 403 without calling notification-service when an employee token marks a notification read',
      async () => {
        const requestsBefore = notificationService.requestCount();

        await request(app.getHttpServer())
          .post(INBOX_READ_PATH)
          .set('Authorization', `Bearer ${employeeToken}`)
          .expect(403);

        expect(notificationService.requestCount()).toBe(requestsBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should answer 400 without calling notification-service when the list query has an unknown key',
      async () => {
        const requestsBefore = notificationService.requestCount();

        await getWithToken(`${INBOX_LIST_PATH}?recipientAccountId=${randomUUID()}`, hrToken).expect(
          400,
        );

        expect(notificationService.requestCount()).toBe(requestsBefore);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
