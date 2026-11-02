import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { ApiGatewayConfigSchema } from '../src/config/api-gateway-config.schema.js';
import { setupSwaggerDocs } from '../src/docs/setup-swagger-docs.js';
import { API_ROUTES } from '../src/docs/openapi.routes.js';
import {
  authEnvironmentFor,
  generateAuthKeySet,
  userJwtVerifierEnvironmentFor,
} from './auth-key-set.js';

// The document paths key, set by the zod contracts table: one entry per method and path.
type EndpointKey = string;

function endpointKey(method: string, path: string): EndpointKey {
  return `${method.toUpperCase()} ${path}`;
}

describe('api-gateway OpenAPI docs', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // The docs page does not call the domain services, so the URLs only have to be valid internal addresses.
    const config = parseConfig(ApiGatewayConfigSchema, {
      BUSINESS_TIMEZONE: 'Asia/Jakarta',
      ...authEnvironmentFor(generateAuthKeySet(), ServiceName.API_GATEWAY),
      ...userJwtVerifierEnvironmentFor(generateAuthKeySet()),
      AUTH_SERVICE_INTERNAL_URL: 'http://auth-service:3000',
      EMPLOYEE_SERVICE_INTERNAL_URL: 'http://employee-service:3000',
      ATTENDANCE_SERVICE_INTERNAL_URL: 'http://attendance-service:3000',
      NOTIFICATION_SERVICE_INTERNAL_URL: 'http://notification-service:3000',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] }, { isSwaggerEnabled: true });
    setupSwaggerDocs(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists one documented operation for every table route, and nothing unlisted', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const document = response.body as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };

    expect(document.openapi).toBe('3.0.3');
    const documentedKeys = new Set(
      Object.entries(document.paths).flatMap(([path, operations]) =>
        Object.keys(operations)
          .filter((method) => method !== 'options')
          .map((method) => endpointKey(method, path)),
      ),
    );
    const tableKeys = new Set(
      API_ROUTES.map((route) => endpointKey(route.method, `/api/v1${route.path}`)),
    );

    expect(documentedKeys.size).toBe(tableKeys.size);
    expect([...documentedKeys].sort()).toEqual([...tableKeys].sort());
  });

  it('serves the browser docs under /docs outside production', async () => {
    const response = await request(app.getHttpServer()).get('/docs').expect(200);
    expect(response.text).toContain('Swagger UI');
  });

  it('carries the Bearer requirement exactly on the guarded routes', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const document = response.body as {
      paths: Record<string, Record<string, { security?: ReadonlyArray<unknown> } | undefined>>;
    };

    for (const route of API_ROUTES) {
      const path = `/api/v1${route.path}`;
      const operation = document.paths[path]?.[route.method];
      if (operation === undefined) {
        throw new Error(`The document holds no operation for ${endpointKey(route.method, path)}.`);
      }
      if (route.isPublic === true) {
        expect(operation.security).toBeUndefined();
      } else {
        expect(operation.security).toHaveLength(1);
      }
    }
  });
});
