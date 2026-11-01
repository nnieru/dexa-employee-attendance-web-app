import { createSign, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  ACCOUNT_STATUS_READER,
  configureApp,
  parseConfig,
  ServiceName,
  type IAccountStatusReader,
} from '@dexa/common';
import {
  correctionRequestReviewPageSchema,
  overtimeRequestReviewPageSchema,
  Role,
  type CorrectionRequestReviewPage,
  type OvertimeRequestReviewPage,
} from '@dexa/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { ApiGatewayConfigSchema } from '../src/config/api-gateway-config.schema.js';
import {
  authEnvironmentFor,
  generateAuthKeySet,
  userJwtVerifierEnvironmentFor,
  USER_JWT_AUDIENCE,
  USER_JWT_ISSUER,
  type AuthKeySet,
} from './auth-key-set.js';
import { verifyGatewayToken } from './gateway-token.js';

const LOCALHOST = '127.0.0.1';
const LOCALHOST_URL = 'http://127.0.0.1';
const OVERTIME_QUEUE_PATH = '/api/v1/overtime-requests';
const CORRECTION_QUEUE_PATH = '/api/v1/attendance-corrections';
const USER_JWT_LIFETIME_SECONDS = 300;
const TEST_TIMEOUT_MS = 30_000;
const EMPLOYEE_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

type UpstreamCall = {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly authorization: string | undefined;
};

// Stands in for attendance-service. It checks the gateway's token with api-gateway's key only, records each call, and
// answers with the scripted body. The queue answers are the review pages the contract defines.
type AttendanceServiceStub = {
  readonly baseUrl: string;
  readonly calls: UpstreamCall[];
  answerWith(status: number, body: unknown): void;
  close(): Promise<void>;
};

async function startAttendanceServiceStub(keys: AuthKeySet): Promise<AttendanceServiceStub> {
  const calls: UpstreamCall[] = [];
  let answer: { status: number; body: unknown } = { status: 200, body: EMPTY_OVERTIME_PAGE };
  const server: Server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    calls.push({
      method: incoming.method,
      path: incoming.url,
      authorization: incoming.headers.authorization,
    });
    try {
      verifyGatewayToken(keys, incoming.headers.authorization, ServiceName.ATTENDANCE_SERVICE);
    } catch {
      writeJson(response, 401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }
    writeJson(response, answer.status, answer.body);
  });
  await new Promise<void>((resolve) => server.listen(0, LOCALHOST, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The attendance-service stub did not listen on a TCP port.');
  }
  return {
    baseUrl: `http://${LOCALHOST}:${address.port}`,
    calls,
    answerWith: (status, body) => {
      answer = { status, body };
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

// The account statuses that the gateway's check reads. Every account in these tests is active.
class ActiveAccountStatuses implements IAccountStatusReader {
  findAccountStatus() {
    return Promise.resolve({ isActive: true });
  }
}

// An end-user JWT as auth-service signs it (RS256 with the user key). The gateway is the only verifier of these.
function signEndUserJwt(keys: AuthKeySet, accountId: string, role: Role): string {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = [
    encode({ alg: 'RS256', typ: 'JWT' }),
    encode({
      sub: accountId,
      role,
      iss: USER_JWT_ISSUER,
      aud: USER_JWT_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + USER_JWT_LIFETIME_SECONDS,
    }),
  ].join('.');
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(keys.user.privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}

const EMPTY_OVERTIME_PAGE: OvertimeRequestReviewPage = {
  items: [],
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

const CORRECTION_PAGE: CorrectionRequestReviewPage = {
  items: [
    {
      id: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c3f',
      businessDate: '2026-11-02',
      requestedDayStatus: 'PRESENT',
      clockInAt: '2026-11-02T02:00:00.000Z',
      clockOutAt: null,
      reason: 'Forgot to clock in',
      status: 'PENDING',
      reviewReason: null,
      reviewedAt: null,
      createdAt: '2026-11-02T10:00:00.000Z',
      requester: { accountId: EMPLOYEE_ID, name: 'Nadia Rahma' },
      isOwnRequest: false,
      current: { clockInAt: null, clockOutAt: null, dayStatus: 'PENDING' },
    },
  ],
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
};

describe('api-gateway HR review queue', () => {
  let keys: AuthKeySet;
  let attendanceService: AttendanceServiceStub;
  let app: INestApplication;

  beforeAll(async () => {
    keys = generateAuthKeySet();
    attendanceService = await startAttendanceServiceStub(keys);
    const config = parseConfig(ApiGatewayConfigSchema, {
      BUSINESS_TIMEZONE: 'Asia/Jakarta',
      ...authEnvironmentFor(keys, ServiceName.API_GATEWAY),
      ...userJwtVerifierEnvironmentFor(keys),
      // Not reached: the account status is answered by the stub reader below.
      AUTH_SERVICE_INTERNAL_URL: 'http://127.0.0.1:9',
      EMPLOYEE_SERVICE_INTERNAL_URL: 'http://127.0.0.1:9',
      ATTENDANCE_SERVICE_INTERNAL_URL: attendanceService.baseUrl,
      NOTIFICATION_SERVICE_INTERNAL_URL: 'http://127.0.0.1:9',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    })
      .overrideProvider(ACCOUNT_STATUS_READER)
      .useValue(new ActiveAccountStatuses())
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await attendanceService?.close();
  });

  beforeEach(() => {
    attendanceService.answerWith(200, EMPTY_OVERTIME_PAGE);
  });

  function getQueue(path: string, accessToken: string | undefined, query: string) {
    const pending = request(app.getHttpServer()).get(`${path}${query}`);
    if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
    return pending;
  }

  function forwardedQueryOf(path: string | undefined): Record<string, string> {
    return Object.fromEntries(new URL(path ?? '/', LOCALHOST_URL).searchParams);
  }

  it.each([
    { label: 'overtime', path: OVERTIME_QUEUE_PATH },
    { label: 'correction', path: CORRECTION_QUEUE_PATH },
  ])(
    'should forward the $label queue with the HR token and the query, and answer the contract page',
    async ({ path }) => {
      const hrAccountId = randomUUID();
      const page = path === OVERTIME_QUEUE_PATH ? EMPTY_OVERTIME_PAGE : CORRECTION_PAGE;
      attendanceService.answerWith(200, page);
      const callsBefore = attendanceService.calls.length;

      const response = await getQueue(
        path,
        signEndUserJwt(keys, hrAccountId, Role.HR),
        '?status=APPROVED&employeeId=' +
          EMPLOYEE_ID +
          '&from=2026-11-01&to=2026-11-03&page=2&pageSize=5',
      ).expect(200);

      const parse =
        path === OVERTIME_QUEUE_PATH
          ? overtimeRequestReviewPageSchema.parse
          : correctionRequestReviewPageSchema.parse;
      expect(parse(response.body)).toEqual(page);
      const forwarded = attendanceService.calls.at(callsBefore);
      expect(forwarded).toMatchObject({ method: 'GET' });
      expect(forwarded?.path?.startsWith(`${path}?`)).toBe(true);
      expect(forwardedQueryOf(forwarded?.path)).toEqual({
        status: 'APPROVED',
        employeeId: EMPLOYEE_ID,
        from: '2026-11-01',
        to: '2026-11-03',
        page: '2',
        pageSize: '5',
      });
      expect(
        verifyGatewayToken(keys, forwarded?.authorization, ServiceName.ATTENDANCE_SERVICE),
      ).toEqual({ accountId: hrAccountId, role: Role.HR });
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { label: 'overtime', path: OVERTIME_QUEUE_PATH },
    { label: 'correction', path: CORRECTION_QUEUE_PATH },
  ])(
    'should forward the default pending filter when the $label query is empty',
    async ({ path }) => {
      const callsBefore = attendanceService.calls.length;

      await getQueue(path, signEndUserJwt(keys, randomUUID(), Role.HR), '').expect(200);

      const forwarded = attendanceService.calls.at(callsBefore);
      expect(forwardedQueryOf(forwarded?.path)).toEqual({
        status: 'PENDING',
        page: '1',
        pageSize: '20',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { label: 'overtime', path: OVERTIME_QUEUE_PATH },
    { label: 'correction', path: CORRECTION_QUEUE_PATH },
  ])(
    'should return 403 and call nothing when an employee token reads the $label queue',
    async ({ path }) => {
      const callsBefore = attendanceService.calls.length;

      const response = await getQueue(
        path,
        signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE),
        '',
      ).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403 });
      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { label: 'overtime', path: OVERTIME_QUEUE_PATH },
    { label: 'correction', path: CORRECTION_QUEUE_PATH },
  ])(
    'should return 401 and call nothing when the $label queue is read without a token',
    async ({ path }) => {
      const callsBefore = attendanceService.calls.length;

      const response = await getQueue(path, undefined, '').expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    { condition: 'the status is not a request status', query: '?status=CANCELLED' },
    { condition: 'the employee is not an account ID', query: '?employeeId=nadia' },
    { condition: 'from is after to', query: '?from=2026-11-05&to=2026-11-02' },
    { condition: 'the page size is above the maximum', query: '?pageSize=101' },
    { condition: 'the requester is named by accountId', query: `?accountId=${randomUUID()}` },
  ])(
    'should return 400 and call nothing when $condition',
    async ({ query }) => {
      const callsBefore = attendanceService.calls.length;

      const response = await getQueue(
        OVERTIME_QUEUE_PATH,
        signEndUserJwt(keys, randomUUID(), Role.HR),
        query,
      ).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );
});
