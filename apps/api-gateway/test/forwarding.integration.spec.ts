import { createSign, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  configureApp,
  parseConfig,
  ServiceName,
  ACCOUNT_STATUS_READER,
  type IAccountStatusReader,
} from '@dexa/common';
import { Role } from '@dexa/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createAppModule } from '../src/app.module.js';
import { ApiGatewayConfigSchema } from '../src/config/api-gateway-config.schema.js';
import { NOTIFICATION_STREAM_ACCOUNT_CHECK_MILLISECONDS } from '../src/notifications/notification-stream-client.interface.js';
import {
  authEnvironmentFor,
  generateAuthKeySet,
  userJwtVerifierEnvironmentFor,
  USER_JWT_AUDIENCE,
  USER_JWT_ISSUER,
  type AuthKeySet,
} from './auth-key-set.js';
import { verifyGatewayToken } from './gateway-token.js';
import {
  startNotificationServiceStub,
  type NotificationServiceStub,
  type UpstreamStream,
} from './notification-service-stub.js';

const LOCALHOST = '127.0.0.1';
const OWN_PROFILE_PATH = '/api/v1/employees/me';
const NOTIFICATION_STREAM_PATH = '/api/v1/notifications/stream';
const CHECK_INTERVAL_MILLISECONDS = 50;
const USER_JWT_LIFETIME_SECONDS = 300;
const ACCOUNT_DISABLED_BODY = {
  statusCode: 401,
  code: 'ACCOUNT_DISABLED',
  message: 'This account is no longer active.',
};
const FIRST_FRAME = 'event: notification\ndata: {"id":"first"}\n\n';
// Longer than the check interval several times over, so a missed check fails the test rather than racing it.
const WAIT_MILLISECONDS = 5_000;
const TEST_TIMEOUT_MS = 30_000;

// The account statuses that the gateway's check reads. A test flips one to simulate a deactivation.
class ScriptedAccountStatuses implements IAccountStatusReader {
  private readonly isActiveByAccountId = new Map<string, boolean>();

  set(accountId: string, isActive: boolean): void {
    this.isActiveByAccountId.set(accountId, isActive);
  }

  findAccountStatus(accountId: string) {
    const isActive = this.isActiveByAccountId.get(accountId);
    return Promise.resolve(isActive === undefined ? undefined : { isActive });
  }
}

type UpstreamCall = { readonly authorization: string | undefined; readonly path: string };

// Stands in for employee-service. It checks the token the way the real service does, with api-gateway's key only,
// and records every call so a test can see what the gateway sent.
async function startEmployeeServiceStub(
  keys: AuthKeySet,
): Promise<{ baseUrl: string; calls: UpstreamCall[]; close: () => Promise<void> }> {
  const calls: UpstreamCall[] = [];
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    calls.push({ authorization: request.headers.authorization, path: request.url ?? '' });
    try {
      verifyGatewayToken(keys, request.headers.authorization, ServiceName.EMPLOYEE_SERVICE);
    } catch {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }),
      );
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        accountId: randomUUID(),
        name: 'Nadia Rahma',
        email: 'nadia.rahma@dexa.test',
        position: { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
        phoneNumber: null,
        photoUrl: null,
        profileStatus: 'INCOMPLETE',
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, LOCALHOST, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The employee-service stub did not listen on a TCP port.');
  }
  return {
    baseUrl: `http://${LOCALHOST}:${address.port}`,
    calls,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
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

describe('api-gateway forwarding and account checks', () => {
  let keys: AuthKeySet;
  let statuses: ScriptedAccountStatuses;
  let employeeService: Awaited<ReturnType<typeof startEmployeeServiceStub>>;
  let notificationService: NotificationServiceStub;
  let app: INestApplication;
  let gatewayUrl: string;
  const accountId = randomUUID();

  beforeAll(async () => {
    keys = generateAuthKeySet();
    statuses = new ScriptedAccountStatuses();
    statuses.set(accountId, true);
    employeeService = await startEmployeeServiceStub(keys);
    notificationService = await startNotificationServiceStub();
    const config = parseConfig(ApiGatewayConfigSchema, {
      BUSINESS_TIMEZONE: 'Asia/Jakarta',
      ...authEnvironmentFor(keys, ServiceName.API_GATEWAY),
      ...userJwtVerifierEnvironmentFor(keys),
      // Not reached: the account status is answered by the scripted reader below.
      AUTH_SERVICE_INTERNAL_URL: 'http://127.0.0.1:9',
      EMPLOYEE_SERVICE_INTERNAL_URL: employeeService.baseUrl,
      ATTENDANCE_SERVICE_INTERNAL_URL: 'http://127.0.0.1:9',
      NOTIFICATION_SERVICE_INTERNAL_URL: notificationService.baseUrl,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    })
      .overrideProvider(ACCOUNT_STATUS_READER)
      .useValue(statuses)
      .overrideProvider(NOTIFICATION_STREAM_ACCOUNT_CHECK_MILLISECONDS)
      .useValue(CHECK_INTERVAL_MILLISECONDS)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
    await app.listen(0, LOCALHOST);
    gatewayUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await notificationService?.close();
    await employeeService?.close();
  });

  it(
    'should forward a token that names the user, signed by api-gateway, and never the end-user JWT',
    async () => {
      const userJwt = signEndUserJwt(keys, accountId, Role.EMPLOYEE);

      const response = await fetch(`${gatewayUrl}${OWN_PROFILE_PATH}`, {
        headers: { Authorization: `Bearer ${userJwt}` },
      });

      expect(response.status).toBe(200);
      const forwarded = employeeService.calls.at(-1);
      expect(forwarded?.authorization).not.toContain(userJwt);
      expect(
        verifyGatewayToken(keys, forwarded?.authorization, ServiceName.EMPLOYEE_SERVICE),
      ).toEqual({
        accountId,
        role: Role.EMPLOYEE,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should refuse with 401 ACCOUNT_DISABLED at the gateway, without calling employee-service, when the account is deactivated',
    async () => {
      const deactivatedAccountId = randomUUID();
      statuses.set(deactivatedAccountId, false);
      const callsBefore = employeeService.calls.length;

      const response = await fetch(`${gatewayUrl}${OWN_PROFILE_PATH}`, {
        headers: {
          Authorization: `Bearer ${signEndUserJwt(keys, deactivatedAccountId, Role.EMPLOYEE)}`,
        },
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(ACCOUNT_DISABLED_BODY);
      expect(employeeService.calls.length).toBe(callsBefore);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'should close an open notification stream and abort upstream once the account is deactivated',
    async () => {
      const hrAccountId = randomUUID();
      statuses.set(hrAccountId, true);
      const response = await fetch(`${gatewayUrl}${NOTIFICATION_STREAM_PATH}`, {
        headers: { Authorization: `Bearer ${signEndUserJwt(keys, hrAccountId, Role.HR)}` },
      });
      const upstream: UpstreamStream = await notificationService.nextStream();
      expect(
        verifyGatewayToken(keys, upstream.authorization, ServiceName.NOTIFICATION_SERVICE),
      ).toEqual({
        accountId: hrAccountId,
        role: Role.HR,
      });
      upstream.write(FIRST_FRAME);
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('The stream answered without a body.');
      const firstChunk = await reader.read();
      expect(new TextDecoder().decode(firstChunk.value)).toBe(FIRST_FRAME);

      statuses.set(hrAccountId, false);

      await Promise.race([
        upstream.closed,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('upstream still open')), WAIT_MILLISECONDS),
        ),
      ]);
      let isClientEnded = false;
      for (let attempt = 0; attempt < 50 && !isClientEnded; attempt += 1) {
        try {
          const chunk = await reader.read();
          isClientEnded = chunk.done;
        } catch {
          isClientEnded = true;
        }
      }
      expect(isClientEnded).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );
});
