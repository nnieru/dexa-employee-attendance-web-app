import { configureApp, parseConfig } from '@dexa/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AuthServiceConfigSchema } from '../src/config/auth-service-config.schema.js';
import { authServiceEnvironment, generateAuthKeySet } from './auth-key-set.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;

describe('auth-service health', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    const config = parseConfig(
      AuthServiceConfigSchema,
      authServiceEnvironment(generateAuthKeySet(), {
        AUTH_DATABASE_URL: container.getConnectionUri(),
      }),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
  }, CONTAINER_TIMEOUT_MS);

  // Teardown still stops the container when setup failed partway through.
  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  it('reports liveness under the API prefix', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
