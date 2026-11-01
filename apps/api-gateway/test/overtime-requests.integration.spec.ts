import { createSign, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  ACCOUNT_STATUS_READER,
  configureApp,
  parseConfig,
  ServiceName,
  type IAccountStatusReader,
} from '@dexa/common';
import { Role, type OvertimeRequest, type OvertimeRequestPage } from '@dexa/contracts';
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
const LIST_PATH = '/api/v1/overtime-requests/me';
const SUBMIT_PATH = '/api/v1/overtime-requests';
const USER_JWT_LIFETIME_SECONDS = 300;
const TEST_TIMEOUT_MS = 30_000;

const SUBMIT_BODY = {
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
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-11-02T10:00:00.000Z',
};

type UpstreamCall = {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly authorization: string | undefined;
  readonly body: unknown;
};

type UpstreamAnswer = { readonly status: number; readonly body: unknown };

// Stands in for attendance-service. It checks the gateway's token with api-gateway's key only, records each call, and
// answers with the scripted answer. A test sets the answer it needs.
type AttendanceServiceStub = {
  readonly baseUrl: string;
  readonly calls: UpstreamCall[];
  answerWith(answer: UpstreamAnswer): void;
  close(): Promise<void>;
};

async function startAttendanceServiceStub(keys: AuthKeySet): Promise<AttendanceServiceStub> {
  const calls: UpstreamCall[] = [];
  let answer: UpstreamAnswer = { status: 201, body: SAVED_REQUEST };
  const server: Server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      calls.push({
        method: incoming.method,
        path: incoming.url,
        authorization: incoming.headers.authorization,
        body: text === '' ? undefined : JSON.parse(text),
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

describe('api-gateway overtime request submission', () => {
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
    attendanceService.answerWith({ status: 201, body: SAVED_REQUEST });
  });

  function postSubmit(accessToken: string | undefined, body: unknown) {
    const pending = request(app.getHttpServer()).post(SUBMIT_PATH);
    if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
    return pending.send(body as object);
  }

  it(
    'should forward the request to attendance-service with a token that names the employee and answer 201',
    async () => {
      const accountId = randomUUID();
      const callsBefore = attendanceService.calls.length;

      const response = await postSubmit(
        signEndUserJwt(keys, accountId, Role.EMPLOYEE),
        SUBMIT_BODY,
      ).expect(201);

      expect(response.body).toEqual(SAVED_REQUEST);
      const forwarded = attendanceService.calls.at(callsBefore);
      expect(forwarded).toMatchObject({ method: 'POST', path: SUBMIT_PATH, body: SUBMIT_BODY });
      expect(
        verifyGatewayToken(keys, forwarded?.authorization, ServiceName.ATTENDANCE_SERVICE),
      ).toEqual({
        accountId,
        role: Role.EMPLOYEE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should forward the request for an HR account the same way',
    async () => {
      const accountId = randomUUID();
      const callsBefore = attendanceService.calls.length;

      await postSubmit(signEndUserJwt(keys, accountId, Role.HR), SUBMIT_BODY).expect(201);

      const forwarded = attendanceService.calls.at(callsBefore);
      expect(
        verifyGatewayToken(keys, forwarded?.authorization, ServiceName.ATTENDANCE_SERVICE),
      ).toEqual({
        accountId,
        role: Role.HR,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 401 and call nothing when the request has no token',
    async () => {
      const callsBefore = attendanceService.calls.length;

      const response = await postSubmit(undefined, SUBMIT_BODY).expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 and call nothing when the body names the requester',
    async () => {
      const callsBefore = attendanceService.calls.length;

      const response = await postSubmit(signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE), {
        ...SUBMIT_BODY,
        requestedByAccountId: randomUUID(),
      }).expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should return 400 and call nothing when the reason is blank',
    async () => {
      const callsBefore = attendanceService.calls.length;

      await postSubmit(signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE), {
        ...SUBMIT_BODY,
        reason: '   ',
      }).expect(400);

      expect(attendanceService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should pass attendance-service 409 OVERTIME_OVERLAP through with its code and message',
    async () => {
      attendanceService.answerWith({
        status: 409,
        body: {
          statusCode: 409,
          code: 'OVERTIME_OVERLAP',
          message: 'This overtime overlaps a pending or approved overtime request.',
        },
      });

      const response = await postSubmit(
        signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE),
        SUBMIT_BODY,
      ).expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        code: 'OVERTIME_OVERLAP',
        message: 'This overtime overlaps a pending or approved overtime request.',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should pass attendance-service 400 policy codes through with their code',
    async () => {
      attendanceService.answerWith({
        status: 400,
        body: {
          statusCode: 400,
          code: 'OVERTIME_DAILY_CAP_EXCEEDED',
          message: 'Pending and approved overtime for this date can total at most 4 hours.',
        },
      });

      const response = await postSubmit(
        signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE),
        SUBMIT_BODY,
      ).expect(400);

      expect(response.body).toMatchObject({ code: 'OVERTIME_DAILY_CAP_EXCEEDED' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should map an attendance-service 500 to 503 without the upstream detail',
    async () => {
      attendanceService.answerWith({
        status: 500,
        body: {
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: 'relation "overtime_requests" does not exist',
        },
      });

      const response = await postSubmit(
        signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE),
        SUBMIT_BODY,
      ).expect(503);

      expect(response.body).toMatchObject({ statusCode: 503, code: 'DEPENDENCY_UNAVAILABLE' });
      expect(JSON.stringify(response.body)).not.toContain('overtime_requests');
    },
    TEST_TIMEOUT_MS,
  );

  describe('own request list', () => {
    const OWN_PAGE: OvertimeRequestPage = {
      items: [SAVED_REQUEST],
      page: 2,
      pageSize: 5,
      totalItems: 6,
      totalPages: 2,
    };

    function getOwnList(accessToken: string | undefined, query: string) {
      const pending = request(app.getHttpServer()).get(`${LIST_PATH}${query}`);
      if (accessToken !== undefined) pending.set('Authorization', `Bearer ${accessToken}`);
      return pending;
    }

    function forwardedQueryOf(path: string | undefined): Record<string, string> {
      return Object.fromEntries(new URL(path ?? '/', LOCALHOST_URL).searchParams);
    }

    it(
      'should forward the status, page, and page size with a token that names the employee and answer 200',
      async () => {
        const accountId = randomUUID();
        attendanceService.answerWith({ status: 200, body: OWN_PAGE });
        const callsBefore = attendanceService.calls.length;

        const response = await getOwnList(
          signEndUserJwt(keys, accountId, Role.EMPLOYEE),
          '?status=APPROVED&page=2&pageSize=5',
        ).expect(200);

        expect(response.body).toEqual(OWN_PAGE);
        const forwarded = attendanceService.calls.at(callsBefore);
        expect(forwarded).toMatchObject({ method: 'GET' });
        expect(forwarded?.path?.startsWith(`${LIST_PATH}?`)).toBe(true);
        expect(forwardedQueryOf(forwarded?.path)).toEqual({
          status: 'APPROVED',
          page: '2',
          pageSize: '5',
        });
        expect(
          verifyGatewayToken(keys, forwarded?.authorization, ServiceName.ATTENDANCE_SERVICE),
        ).toEqual({ accountId, role: Role.EMPLOYEE });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should forward the list for an HR account the same way',
      async () => {
        const accountId = randomUUID();
        attendanceService.answerWith({ status: 200, body: OWN_PAGE });
        const callsBefore = attendanceService.calls.length;

        await getOwnList(signEndUserJwt(keys, accountId, Role.HR), '?page=2&pageSize=5').expect(
          200,
        );

        const forwarded = attendanceService.calls.at(callsBefore);
        expect(
          verifyGatewayToken(keys, forwarded?.authorization, ServiceName.ATTENDANCE_SERVICE),
        ).toEqual({ accountId, role: Role.HR });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should forward the default page and page size with no status when the query is empty',
      async () => {
        attendanceService.answerWith({ status: 200, body: OWN_PAGE });
        const callsBefore = attendanceService.calls.length;

        await getOwnList(signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE), '').expect(200);

        const forwarded = attendanceService.calls.at(callsBefore);
        expect(forwardedQueryOf(forwarded?.path)).toEqual({ page: '1', pageSize: '20' });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should return 401 and call nothing when the request has no token',
      async () => {
        const callsBefore = attendanceService.calls.length;

        const response = await getOwnList(undefined, '').expect(401);

        expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
        expect(attendanceService.calls.length).toBe(callsBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it.each([
      { condition: 'the status is not a request status', query: '?status=CANCELLED' },
      { condition: 'the page size is above the maximum', query: '?pageSize=101' },
      { condition: 'the account is named in the query', query: `?accountId=${randomUUID()}` },
    ])(
      'should return 400 and call nothing when $condition',
      async ({ query }) => {
        const callsBefore = attendanceService.calls.length;

        const response = await getOwnList(
          signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE),
          query,
        ).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
        expect(attendanceService.calls.length).toBe(callsBefore);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'should map an answer that does not match the contract to 503 without the upstream body',
      async () => {
        attendanceService.answerWith({
          status: 200,
          body: { ...OWN_PAGE, items: [{ ...SAVED_REQUEST, status: 'CANCELLED' }] },
        });

        const response = await getOwnList(
          signEndUserJwt(keys, randomUUID(), Role.EMPLOYEE),
          '',
        ).expect(503);

        expect(response.body).toMatchObject({ statusCode: 503, code: 'DEPENDENCY_UNAVAILABLE' });
        expect(JSON.stringify(response.body)).not.toContain('CANCELLED');
      },
      TEST_TIMEOUT_MS,
    );
  });
});
