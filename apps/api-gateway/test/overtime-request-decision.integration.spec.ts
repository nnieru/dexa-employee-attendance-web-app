import { createSign, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  ACCOUNT_STATUS_READER,
  configureApp,
  parseConfig,
  ServiceName,
  type IAccountStatusReader,
} from '@dexa/common';
import { ErrorCode, Role, type OvertimeRequest } from '@dexa/contracts';
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
const USER_JWT_LIFETIME_SECONDS = 300;
const TEST_TIMEOUT_MS = 30_000;
const REQUEST_ID = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';
const OVERTIME_PATH = '/api/v1/overtime-requests';

type UpstreamCall = {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly authorization: string | undefined;
  readonly body: unknown;
};

type UpstreamAnswer = { readonly status: number; readonly body: unknown };

// Stands in for attendance-service. It checks the gateway's token with api-gateway's key only, records each call, and
// answers with the scripted answer.
type AttendanceServiceStub = {
  readonly baseUrl: string;
  readonly calls: UpstreamCall[];
  answerWith(answer: UpstreamAnswer): void;
  close(): Promise<void>;
};

const DECIDED_REQUEST: OvertimeRequest = {
  id: REQUEST_ID,
  businessDate: '2026-11-02',
  startAt: '2026-11-02T11:00:00.000Z',
  endAt: '2026-11-02T13:00:00.000Z',
  reason: 'Release deployment',
  status: 'APPROVED',
  reviewReason: null,
  reviewedAt: '2026-11-06T04:00:00.000Z',
  createdAt: '2026-11-02T10:00:00.000Z',
};

async function startAttendanceServiceStub(keys: AuthKeySet): Promise<AttendanceServiceStub> {
  const calls: UpstreamCall[] = [];
  let answer: UpstreamAnswer = { status: 200, body: DECIDED_REQUEST };
  const server: Server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      calls.push({
        method: incoming.method,
        path: incoming.url,
        authorization: incoming.headers.authorization,
        body: text.length === 0 ? undefined : JSON.parse(text),
      });
      try {
        verifyGatewayToken(keys, incoming.headers.authorization, ServiceName.ATTENDANCE_SERVICE);
      } catch {
        writeJson(response, 401, {
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
        });
        return;
      }
      writeJson(response, answer.status, answer.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, LOCALHOST, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The attendance-service stub did not listen on a TCP port.');
  }
  return {
    baseUrl: `http://${LOCALHOST}:${address.port}`,
    calls,
    answerWith: (next) => {
      answer = next;
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

describe('api-gateway overtime request decisions', () => {
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
    attendanceService.answerWith({ status: 200, body: DECIDED_REQUEST });
  });

  function decide(
    action: 'approve' | 'reject',
    accessToken: string | undefined,
    body: Record<string, unknown> | undefined,
    requestId = REQUEST_ID,
  ) {
    const pending = request(app.getHttpServer()).post(`${OVERTIME_PATH}/${requestId}/${action}`);
    if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
    return body === undefined ? pending : pending.send(body);
  }

  it.each(['approve', 'reject'] as const)(
    'should forward the HR %s with the token account, the ID, and the body, and answer the contract request',
    async (action) => {
      const hrAccountId = randomUUID();
      const callsBefore = attendanceService.calls.length;
      const body = action === 'approve' ? { reviewReason: 'Confirmed' } : { reviewReason: 'No' };

      const response = await decide(
        action,
        signEndUserJwt(keys, hrAccountId, Role.HR),
        body,
      ).expect(200);

      expect(response.body).toEqual(DECIDED_REQUEST);
      const forwarded = attendanceService.calls.at(callsBefore);
      expect(forwarded).toMatchObject({
        method: 'POST',
        path: `${OVERTIME_PATH}/${REQUEST_ID}/${action}`,
        body,
      });
      expect(
        verifyGatewayToken(keys, forwarded?.authorization, ServiceName.ATTENDANCE_SERVICE),
      ).toEqual({ accountId: hrAccountId, role: Role.HR });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should forward an approval sent with no body as an empty body',
    async () => {
      const callsBefore = attendanceService.calls.length;

      await decide('approve', signEndUserJwt(keys, randomUUID(), Role.HR), undefined).expect(200);

      expect(attendanceService.calls.at(callsBefore)?.body).toEqual({});
    },
    TEST_TIMEOUT_MS,
  );

  it.each(['approve', 'reject'] as const)(
    'should return 403 and call nothing when an employee token decides a request with %s',
    async (action) => {
      const callsBefore = attendanceService.calls.length;

      const response = await decide(action, signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE), {
        reviewReason: 'Mine',
      }).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403 });
      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it.each(['approve', 'reject'] as const)(
    'should return 401 and call nothing when the %s has no token',
    async (action) => {
      const callsBefore = attendanceService.calls.length;

      const response = await decide(action, undefined, { reviewReason: 'Mine' }).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    {
      action: 'approve',
      condition: 'the body names the reviewer',
      body: { reviewerAccountId: randomUUID() },
    },
    { action: 'approve', condition: 'the body sends a status', body: { status: 'REJECTED' } },
    {
      action: 'approve',
      condition: 'the reason is too long',
      body: { reviewReason: 'x'.repeat(501) },
    },
    { action: 'reject', condition: 'the reason is missing', body: {} },
    {
      action: 'reject',
      condition: 'the body names the reviewer',
      body: { reviewReason: 'No', reviewedByAccountId: randomUUID() },
    },
    {
      action: 'reject',
      condition: 'the reason is too long',
      body: { reviewReason: 'x'.repeat(501) },
    },
  ] as const)(
    'should return 400 and call nothing for $action when $condition',
    async ({ action, body }) => {
      const callsBefore = attendanceService.calls.length;

      const response = await decide(
        action,
        signEndUserJwt(keys, randomUUID(), Role.HR),
        body,
      ).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: ErrorCode.VALIDATION_FAILED });
      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 and call nothing when the request ID is not a UUID',
    async () => {
      const callsBefore = attendanceService.calls.length;

      await decide('approve', signEndUserJwt(keys, randomUUID(), Role.HR), {}, 'not-a-uuid').expect(
        400,
      );

      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    {
      status: 403,
      code: ErrorCode.SELF_REVIEW_FORBIDDEN,
      message: 'You cannot review your own request.',
    },
    { status: 404, code: ErrorCode.REQUEST_NOT_FOUND, message: 'The request was not found.' },
    {
      status: 409,
      code: ErrorCode.REQUEST_ALREADY_DECIDED,
      message: 'This request was already decided with a different decision.',
    },
  ])(
    'should pass attendance-service $status $code through with its code and message',
    async ({ status, code, message }) => {
      attendanceService.answerWith({ status, body: { statusCode: status, code, message } });

      const response = await decide('reject', signEndUserJwt(keys, randomUUID(), Role.HR), {
        reviewReason: 'No',
      }).expect(status);

      expect(response.body).toEqual({ statusCode: status, code, message });
    },
    TEST_TIMEOUT_MS,
  );
});
