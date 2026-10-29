import { ErrorCode } from '@dexa/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  ServiceUnavailableException,
  type INestApplication,
  type LoggerService,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/bootstrap/configure-app.js';
import {
  ConflictError,
  DependencyUnavailableError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../src/errors/domain.errors.js';

const GENERIC_MESSAGE = 'An unexpected error occurred.';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type LoggedError = { message: unknown; stack: unknown; context: unknown };

// Records error logs instead of printing them, so tests can assert what the filter logged.
const loggedErrors: LoggedError[] = [];
const recordingLogger: LoggerService = {
  log: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
  verbose: () => undefined,
  error: (message: unknown, stack?: unknown, context?: unknown) => {
    loggedErrors.push({ message, stack, context });
  },
};

// Test-only routes, one per failure type, so the shared configuration is exercised over HTTP.
@Controller('test-domain-errors')
class DomainErrorsTestController {
  @Get('conflict')
  conflict(): never {
    throw new ConflictError('ATTENDANCE_ALREADY_CLOCKED_IN', 'You are already clocked in.');
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'Employee not found.');
  }

  @Get('validation')
  validation(): never {
    throw new ValidationError(
      ErrorCode.VALIDATION_FAILED,
      'Leave end date is before its start date.',
    );
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenError(ErrorCode.FORBIDDEN, 'Only HR can approve this request.');
  }

  @Get('unauthorized')
  unauthorized(): never {
    throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, 'Your session has expired.');
  }

  @Get('dependency-unavailable')
  dependencyUnavailable(): never {
    throw new DependencyUnavailableError(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      'The auth service did not respond.',
    );
  }

  @Get('bad-request-messages')
  badRequestMessages(): never {
    throw new BadRequestException(['email must be an email', 'name should not be empty']);
  }

  @Get('service-unavailable')
  serviceUnavailable(): never {
    throw new ServiceUnavailableException('Database host db.internal refused the connection.');
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('SELECT secret FROM accounts WHERE token = $1');
  }

  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

describe('domain exception filter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DomainErrorsTestController],
    }).compile();
    app = moduleRef.createNestApplication();
    // Set after compile(), because the testing module installs its own logger during compile().
    app.useLogger(recordingLogger);
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    loggedErrors.length = 0;
  });

  it.each([
    {
      route: 'conflict',
      statusCode: 409,
      code: 'ATTENDANCE_ALREADY_CLOCKED_IN',
      message: 'You are already clocked in.',
    },
    { route: 'not-found', statusCode: 404, code: 'NOT_FOUND', message: 'Employee not found.' },
    {
      route: 'validation',
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Leave end date is before its start date.',
    },
    {
      route: 'forbidden',
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Only HR can approve this request.',
    },
    {
      route: 'unauthorized',
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Your session has expired.',
    },
    {
      route: 'dependency-unavailable',
      statusCode: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'The auth service did not respond.',
    },
  ])(
    'should return $statusCode with code $code when the $route route throws a domain error',
    async ({ route, statusCode, code, message }) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/test-domain-errors/${route}`)
        .expect(statusCode);

      expect(response.body).toEqual({ statusCode, code, message });
    },
  );

  it('should join array messages with a semicolon when a request is rejected', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-domain-errors/bad-request-messages')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'email must be an email; name should not be empty',
    });
  });

  it('should return 400 with code VALIDATION_FAILED when the JSON body is malformed', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/test-domain-errors/echo')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: expect.any(String),
    });
  });

  it('should return 404 with code NOT_FOUND when no route matches the request', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/no-such-route').expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /api/v1/no-such-route',
    });
  });

  it('should return the generic message only when an unexpected error is thrown', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-domain-errors/unexpected')
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: GENERIC_MESSAGE,
    });
    expect(response.text).not.toContain('SELECT');
    expect(response.text).not.toContain('secret');
  });

  it('should return the generic message when a 5xx HTTP exception is thrown', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-domain-errors/service-unavailable')
      .expect(503);

    expect(response.body).toEqual({
      statusCode: 503,
      code: 'INTERNAL_ERROR',
      message: GENERIC_MESSAGE,
    });
    expect(response.text).not.toContain('db.internal');
  });

  it('should echo the correlation ID when the request provides one', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-domain-errors/conflict')
      .set('x-correlation-id', 'trace-abc-123')
      .expect(409);

    expect(response.headers['x-correlation-id']).toBe('trace-abc-123');
  });

  it('should echo the correlation ID when it is exactly 100 characters long', async () => {
    const correlationId = 'c'.repeat(100);

    const response = await request(app.getHttpServer())
      .get('/api/v1/test-domain-errors/conflict')
      .set('x-correlation-id', correlationId)
      .expect(409);

    expect(response.headers['x-correlation-id']).toBe(correlationId);
  });

  it('should generate a UUID correlation ID when the request omits one', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-domain-errors/conflict')
      .expect(409);

    expect(response.headers['x-correlation-id']).toMatch(UUID_PATTERN);
  });

  it.each([
    { condition: 'the header is empty', correlationId: '' },
    { condition: 'the header is longer than 100 characters', correlationId: 'c'.repeat(101) },
  ])('should generate a UUID correlation ID when $condition', async ({ correlationId }) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-domain-errors/conflict')
      .set('x-correlation-id', correlationId)
      .expect(409);

    expect(response.headers['x-correlation-id']).toMatch(UUID_PATTERN);
  });

  it('should log the unexpected error with its correlation ID when it is thrown', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/test-domain-errors/unexpected')
      .set('x-correlation-id', 'trace-500')
      .expect(500);

    expect(loggedErrors).toEqual([
      {
        message: 'Error answered with HTTP 500 (correlationId=trace-500)',
        stack: expect.any(String),
        context: 'DomainExceptionFilter',
      },
    ]);
  });

  it('should not log a client error', async () => {
    await request(app.getHttpServer()).get('/api/v1/test-domain-errors/not-found').expect(404);

    expect(loggedErrors).toEqual([]);
  });
});
