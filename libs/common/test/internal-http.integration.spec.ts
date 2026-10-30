import { ErrorCode, Role } from '@dexa/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
  type INestApplication,
  type LoggerService,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { AuthenticatedUser } from '../src/auth/authenticated-principal.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { CurrentUser } from '../src/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { ServiceAuthGuard } from '../src/auth/service-auth.guard.js';
import { ServiceName } from '../src/auth/service-name.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { AuthConfigSchema, type AuthConfig } from '../src/config/auth-config.schema.js';
import { parseConfig } from '../src/config/parse-config.js';
import {
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  UnauthorizedError,
} from '../src/errors/domain.errors.js';
import { CORRELATION_ID_HEADER } from '../src/http/correlation-id-header.js';
import {
  INTERNAL_HTTP_CLIENT,
  type IInternalHttpClient,
} from '../src/http/internal-http-client.interface.js';
import { InternalHttpModule } from '../src/http/internal-http.module.js';
import { MAX_GET_RETRIES } from '../src/http/internal-http.rules.js';
import {
  USER_JWT_AUDIENCE,
  USER_JWT_ISSUER,
  authEnvironmentFor,
  generateAuthKeySet,
} from './auth-key-set.js';

const LOCALHOST = '127.0.0.1';

// The fake target is employee-service. Calls addressed to OTHER_SERVICE reach the same server, so
// its audience check is what refuses them.
const TARGET_SERVICE = ServiceName.EMPLOYEE_SERVICE;
const OTHER_SERVICE = ServiceName.ATTENDANCE_SERVICE;
const UNREACHABLE_SERVICE = ServiceName.NOTIFICATION_SERVICE;

const ECHO_PATH = '/api/v1/test-internal/echo';
const INVALID_BODY_PATH = '/api/v1/test-internal/invalid-body';
const FLAKY_PATH = '/api/v1/test-internal/flaky';
const SLOW_PATH = '/api/v1/test-internal/slow';
const ACCOUNTS_PATH = '/api/v1/test-internal/accounts';
const CONFLICT_PATH = '/api/v1/test-internal/conflict';
const PASSWORD_PATH = '/api/v1/test-internal/password';
const NOT_FOUND_WITHOUT_ERROR_BODY_PATH = '/api/v1/test-internal/not-found-without-error-body';
const SESSION_PATH = '/api/v1/test-internal/session';
const USER_ECHO_PATH = '/api/v1/test-internal/user-echo';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const FLAKY_ACCOUNT_ID = 'flaky-account';
const CORRELATION_ID = 'req-7d3e2c1a';
const PERSONAL_DATA_MARKER = 'employee-marker@example.test';
const SHORT_TIMEOUT_MILLISECONDS = 50;
const SLOW_RESPONSE_MILLISECONDS = 400;
// Stands for "every attempt fails", without a magic number.
const ALWAYS_FAILING = Number.POSITIVE_INFINITY;
// 2100-01-01T00:00:00Z, so a token minted for these tests does not expire while they run.
const FAR_FUTURE_EXPIRY_SECONDS = 4_102_444_800;
const EXPIRED_EXPIRY_SECONDS = 1;
const INVALID_CREDENTIALS_CODE = 'INVALID_CREDENTIALS';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

const TARGET_SCRIPT = Symbol('TargetScript');

// Built once for the whole file, from generated keys. The target verifies calls with its own
// configuration and the caller signs them with its own private key.
let targetConfig: AuthConfig;
let callerConfig: AuthConfig;
let userPrivateKeyPem: string;

beforeAll(() => {
  const keys = generateAuthKeySet();
  targetConfig = parseConfig(AuthConfigSchema, authEnvironmentFor(keys, TARGET_SERVICE));
  callerConfig = parseConfig(AuthConfigSchema, authEnvironmentFor(keys, ServiceName.API_GATEWAY));
  userPrivateKeyPem = keys.user.privateKeyPem;
});

const echoResponseSchema = z.object({
  accountId: z.string().optional(),
  correlationId: z.string().optional(),
});
const accountResponseSchema = z.object({ accountId: z.string() });
const createdAccountResponseSchema = z.object({
  received: z.object({ accountId: z.string() }),
});

type TargetScript = {
  flakyFailures: number;
  slowDelayMilliseconds: number;
  refuseWrites: boolean;
  calls: { flaky: number; slow: number; accounts: number; password: number };
};

// A fake employee-service. The real ServiceAuthGuard checks every call, so a request succeeds only
// when its token is signed by the caller and addressed to employee-service.
@Controller('test-internal')
@UseGuards(ServiceAuthGuard)
class InternalTargetController {
  constructor(@Inject(TARGET_SCRIPT) private readonly script: TargetScript) {}

  @Get('echo')
  echo(
    @Query('accountId') accountId: string | undefined,
    @Headers(CORRELATION_ID_HEADER) correlationId: string | undefined,
  ): { accountId: string | undefined; correlationId: string | undefined } {
    return { accountId, correlationId };
  }

  @Get('invalid-body')
  invalidBody(): { unexpected: string } {
    return { unexpected: PERSONAL_DATA_MARKER };
  }

  @Get('flaky')
  flaky(): { accountId: string } {
    this.script.calls.flaky += 1;
    if (this.script.calls.flaky <= this.script.flakyFailures) {
      throw new ServiceUnavailableException();
    }
    return { accountId: FLAKY_ACCOUNT_ID };
  }

  @Get('slow')
  async slow(): Promise<{ accountId: string }> {
    this.script.calls.slow += 1;
    await delay(this.script.slowDelayMilliseconds);
    return { accountId: 'late-account' };
  }

  @Post('accounts')
  createAccount(@Body() body: unknown): { received: unknown } {
    this.script.calls.accounts += 1;
    if (this.script.refuseWrites) throw new ServiceUnavailableException();
    return { received: body };
  }

  // Answers with no body, the way a password change does.
  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(): void {
    this.script.calls.password += 1;
    if (this.script.refuseWrites) throw new ServiceUnavailableException();
  }

  @Get('conflict')
  conflict(): never {
    throw new ConflictError('ATTENDANCE_ALREADY_CLOCKED_IN', 'You are already clocked in.');
  }

  @Get('not-found-without-error-body')
  @HttpCode(HttpStatus.NOT_FOUND)
  notFoundWithoutErrorBody(): { detail: string } {
    return { detail: 'No employee matches this request.' };
  }

  // Answers the way auth-service answers refused credentials.
  @Post('session')
  session(): never {
    throw new UnauthorizedError(INVALID_CREDENTIALS_CODE, INVALID_CREDENTIALS_MESSAGE);
  }
}

// Kept apart from InternalTargetController, whose class-level guard admits only service tokens. This
// route admits only user tokens, so a service token sent here is refused.
@Controller('test-internal')
class UserTargetController {
  @Get('user-echo')
  @UseGuards(JwtAuthGuard)
  userEcho(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

const userEchoResponseSchema = z.object({ accountId: z.string(), role: z.string() });

type RunningTarget = { readonly app: INestApplication; readonly url: string };

async function startTarget(script: TargetScript): Promise<RunningTarget> {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule.forRoot(targetConfig)],
    controllers: [InternalTargetController, UserTargetController],
    providers: [{ provide: TARGET_SCRIPT, useValue: script }],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, { CORS_ORIGINS: [] });
  await app.listen(0, LOCALHOST);
  return { app, url: await app.getUrl() };
}

// Returns a URL that nothing listens on, so a call to it is refused.
async function reserveClosedUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, LOCALHOST, resolve));
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a TCP address.');
  }
  return `http://${LOCALHOST}:${address.port}`;
}

// Records what the client and the target log, so tests can check what never appears in logs.
function recordingLogger(messages: string[]): LoggerService {
  const record = (message: unknown): void => {
    messages.push(String(message));
  };
  return { log: record, warn: record, error: record, debug: record, verbose: record };
}

async function captureRejection(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('Expected the call to reject.');
}

type Harness = {
  readonly client: IInternalHttpClient;
  readonly script: TargetScript;
  readonly logs: string[];
  readonly close: () => Promise<void>;
};

async function startHarness(): Promise<Harness> {
  const script: TargetScript = {
    flakyFailures: 0,
    slowDelayMilliseconds: 0,
    refuseWrites: false,
    calls: { flaky: 0, slow: 0, accounts: 0, password: 0 },
  };
  const target = await startTarget(script);
  const unreachableUrl = await reserveClosedUrl();
  // The caller imports only InternalHttpModule. AuthModule would register the process-wide Passport
  // strategies again and replace the target's, so the target would refuse every call.
  const moduleRef = await Test.createTestingModule({
    imports: [
      InternalHttpModule.forRoot({
        serviceBaseUrls: {
          [TARGET_SERVICE]: target.url,
          [OTHER_SERVICE]: target.url,
          [UNREACHABLE_SERVICE]: unreachableUrl,
        },
        authConfig: callerConfig,
      }),
    ],
  }).compile();
  const logs: string[] = [];
  moduleRef.useLogger(recordingLogger(logs));

  return {
    client: moduleRef.get<IInternalHttpClient>(INTERNAL_HTTP_CLIENT),
    script,
    logs,
    close: async () => {
      await moduleRef.close();
      await target.app.close();
    },
  };
}

describe('InternalHttpClient against a running target', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  describe('get', () => {
    it('should return the parsed body when the target answers with a matching body', async () => {
      const response = await harness.client.get({
        target: TARGET_SERVICE,
        path: ECHO_PATH,
        query: { accountId: ACCOUNT_ID },
        responseSchema: echoResponseSchema,
      });

      expect(response.accountId).toBe(ACCOUNT_ID);
    });

    it('should forward the correlation ID when the request carries one', async () => {
      const response = await harness.client.get({
        target: TARGET_SERVICE,
        path: ECHO_PATH,
        correlationId: CORRELATION_ID,
        responseSchema: echoResponseSchema,
      });

      expect(response.correlationId).toBe(CORRELATION_ID);
    });

    it('should throw DependencyUnavailableError when the body does not match the response schema', async () => {
      const error = await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: INVALID_BODY_PATH,
          responseSchema: accountResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
      expect(error).toMatchObject({ code: ErrorCode.DEPENDENCY_UNAVAILABLE });
    });

    it('should log the path without the response body when the body does not match the response schema', async () => {
      await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: INVALID_BODY_PATH,
          responseSchema: accountResponseSchema,
        }),
      );

      const logged = harness.logs.join('\n');
      expect(logged).toContain(INVALID_BODY_PATH);
      expect(logged).not.toContain(PERSONAL_DATA_MARKER);
    });

    it('should throw DependencyUnavailableError when the call exceeds its timeout', async () => {
      harness.script.slowDelayMilliseconds = SLOW_RESPONSE_MILLISECONDS;

      const error = await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: SLOW_PATH,
          timeoutMilliseconds: SHORT_TIMEOUT_MILLISECONDS,
          responseSchema: accountResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
    });

    it('should return the parsed body when a GET fails with 503 twice and then succeeds', async () => {
      harness.script.flakyFailures = 2;

      const response = await harness.client.get({
        target: TARGET_SERVICE,
        path: FLAKY_PATH,
        responseSchema: accountResponseSchema,
      });

      expect(response).toEqual({ accountId: FLAKY_ACCOUNT_ID });
      expect(harness.script.calls.flaky).toBe(MAX_GET_RETRIES + 1);
    });

    it('should log the retry without the service token when a GET is retried', async () => {
      harness.script.flakyFailures = 1;

      await harness.client.get({
        target: TARGET_SERVICE,
        path: FLAKY_PATH,
        responseSchema: accountResponseSchema,
      });

      const logged = harness.logs.join('\n');
      expect(logged).toContain(`Retrying GET ${FLAKY_PATH}`);
      expect(logged).not.toContain('Bearer');
    });

    it('should throw DependencyUnavailableError after the last retry when every attempt answers 503', async () => {
      harness.script.flakyFailures = ALWAYS_FAILING;

      const error = await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: FLAKY_PATH,
          responseSchema: accountResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
      expect(harness.script.calls.flaky).toBe(MAX_GET_RETRIES + 1);
    });

    it('should throw DependencyUnavailableError when the target refuses the connection', async () => {
      const error = await captureRejection(() =>
        harness.client.get({
          target: UNREACHABLE_SERVICE,
          path: ECHO_PATH,
          responseSchema: echoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
    });

    it('should throw ConflictError with the remote code when the target answers 409', async () => {
      const error = await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: CONFLICT_PATH,
          responseSchema: echoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(ConflictError);
      expect(error).toMatchObject({
        code: 'ATTENDANCE_ALREADY_CLOCKED_IN',
        message: 'You are already clocked in.',
      });
    });

    it('should throw NotFoundError with the generic code when the 404 body is not an error response', async () => {
      const error = await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: NOT_FOUND_WITHOUT_ERROR_BODY_PATH,
          responseSchema: echoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toMatchObject({ code: ErrorCode.NOT_FOUND });
    });

    it('should throw DependencyUnavailableError, not a session error, when the target refuses this service token', async () => {
      // A 401 here means this service's own token was refused, so it is a configuration problem.
      const error = await captureRejection(() =>
        harness.client.get({
          target: OTHER_SERVICE,
          path: ECHO_PATH,
          responseSchema: echoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
      expect(error).toMatchObject({ code: ErrorCode.DEPENDENCY_UNAVAILABLE });
    });
  });

  describe('post', () => {
    it('should return the parsed body when the target accepts the posted body', async () => {
      const response = await harness.client.post({
        target: TARGET_SERVICE,
        path: ACCOUNTS_PATH,
        body: { accountId: ACCOUNT_ID },
        responseSchema: createdAccountResponseSchema,
      });

      expect(response).toEqual({ received: { accountId: ACCOUNT_ID } });
    });

    it('should throw DependencyUnavailableError without retrying when the target answers 503', async () => {
      harness.script.refuseWrites = true;

      const error = await captureRejection(() =>
        harness.client.post({
          target: TARGET_SERVICE,
          path: ACCOUNTS_PATH,
          body: { accountId: ACCOUNT_ID },
          responseSchema: createdAccountResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
      expect(harness.script.calls.accounts).toBe(1);
    });
  });

  describe('patch', () => {
    it('should resolve with no body when the target answers 204', async () => {
      const response = await harness.client.patch({
        target: TARGET_SERVICE,
        path: PASSWORD_PATH,
        body: { currentPassword: 'old-password-1', newPassword: 'new-password-2' },
        responseSchema: z.void(),
      });

      expect(response).toBeUndefined();
    });

    it('should throw DependencyUnavailableError without retrying when the target answers 503', async () => {
      harness.script.refuseWrites = true;

      const error = await captureRejection(() =>
        harness.client.patch({
          target: TARGET_SERVICE,
          path: PASSWORD_PATH,
          body: {},
          responseSchema: z.void(),
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
      expect(harness.script.calls.password).toBe(1);
    });
  });

  describe('forwardedUserToken', () => {
    it('should return the identity of the user when the user token is forwarded', async () => {
      const token = await signUserToken(Role.HR, FAR_FUTURE_EXPIRY_SECONDS);

      const response = await harness.client.get({
        target: TARGET_SERVICE,
        path: USER_ECHO_PATH,
        forwardedUserToken: token,
        responseSchema: userEchoResponseSchema,
      });

      expect(response).toEqual({ accountId: ACCOUNT_ID, role: Role.HR });
    });

    it('should throw UnauthorizedError with the remote code when the forwarded token is refused and its 401 code is listed', async () => {
      const token = await signUserToken(Role.HR, EXPIRED_EXPIRY_SECONDS);

      const error = await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: USER_ECHO_PATH,
          forwardedUserToken: token,
          refusalCodes: [ErrorCode.UNAUTHORIZED],
          responseSchema: userEchoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error).toMatchObject({ code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
    });

    it('should throw DependencyUnavailableError when the forwarded token is refused and no refusal code is listed', async () => {
      const token = await signUserToken(Role.HR, EXPIRED_EXPIRY_SECONDS);

      const error = await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: USER_ECHO_PATH,
          forwardedUserToken: token,
          responseSchema: userEchoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
    });

    it('should not log the forwarded token when the target refuses it', async () => {
      const token = await signUserToken(Role.HR, EXPIRED_EXPIRY_SECONDS);

      await captureRejection(() =>
        harness.client.get({
          target: TARGET_SERVICE,
          path: USER_ECHO_PATH,
          forwardedUserToken: token,
          responseSchema: userEchoResponseSchema,
        }),
      );

      expect(harness.logs.join('\n')).not.toContain(token);
    });
  });

  describe('refusalCodes', () => {
    it('should throw UnauthorizedError with the remote code and message when the target refuses the presented credentials', async () => {
      const error = await captureRejection(() =>
        harness.client.post({
          target: TARGET_SERVICE,
          path: SESSION_PATH,
          body: {},
          refusalCodes: [INVALID_CREDENTIALS_CODE],
          responseSchema: echoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error).toMatchObject({
        code: INVALID_CREDENTIALS_CODE,
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    });

    it('should throw DependencyUnavailableError when the 401 code is not listed', async () => {
      const error = await captureRejection(() =>
        harness.client.post({
          target: TARGET_SERVICE,
          path: SESSION_PATH,
          body: {},
          refusalCodes: [ErrorCode.ACCOUNT_DISABLED],
          responseSchema: echoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
    });

    it('should throw DependencyUnavailableError when this service token is refused, even if a refusal code is listed', async () => {
      // The target refuses this service's token with UNAUTHORIZED, which is not a listed refusal code.
      const error = await captureRejection(() =>
        harness.client.get({
          target: OTHER_SERVICE,
          path: ECHO_PATH,
          refusalCodes: [INVALID_CREDENTIALS_CODE],
          responseSchema: echoResponseSchema,
        }),
      );

      expect(error).toBeInstanceOf(DependencyUnavailableError);
    });

    it('should not log the request body when the target refuses the call without a listed code', async () => {
      await captureRejection(() =>
        harness.client.post({
          target: TARGET_SERVICE,
          path: SESSION_PATH,
          body: { password: PERSONAL_DATA_MARKER },
          responseSchema: echoResponseSchema,
        }),
      );

      const logged = harness.logs.join('\n');
      expect(logged).toContain(SESSION_PATH);
      expect(logged).not.toContain(PERSONAL_DATA_MARKER);
    });
  });
});

async function signUserToken(role: Role, expirySeconds: number): Promise<string> {
  return new JwtService().signAsync(
    { role, exp: expirySeconds },
    {
      privateKey: userPrivateKeyPem,
      algorithm: 'RS256',
      issuer: USER_JWT_ISSUER,
      audience: USER_JWT_AUDIENCE,
      subject: ACCOUNT_ID,
    },
  );
}

describe('InternalHttpModule.forRoot', () => {
  it('should name the field without echoing the URL when a base URL is not http or https', () => {
    const credentialedUrl = 'ftp://user:secret@auth.internal:21';

    expect(() =>
      InternalHttpModule.forRoot({
        serviceBaseUrls: { [ServiceName.AUTH_SERVICE]: credentialedUrl },
        authConfig: callerConfig,
      }),
    ).toThrow(new Error('Invalid configuration: auth-service: must be an http or https URL'));
  });

  it('should name the field without echoing the password when a base URL carries credentials', () => {
    const credentialedUrl = 'http://user:secret@auth.internal:3000';

    expect(() =>
      InternalHttpModule.forRoot({
        serviceBaseUrls: { [ServiceName.AUTH_SERVICE]: credentialedUrl },
        authConfig: callerConfig,
      }),
    ).toThrow(new Error('Invalid configuration: auth-service: must not contain credentials'));
  });
});
