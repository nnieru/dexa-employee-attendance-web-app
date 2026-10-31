import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp, parseConfig } from '@dexa/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { AuditWorkerConfigSchema } from '../src/config/audit-worker-config.schema.js';
import { auditWorkerEnvironment } from './audit-worker-environment.js';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
const CONTAINER_TIMEOUT_MS = 120_000;

describe('audit-worker health', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18').start();
    // The application needs a database at startup because its init hook applies the migrations.
    const config = parseConfig(
      AuditWorkerConfigSchema,
      auditWorkerEnvironment({ AUDIT_DATABASE_URL: container.getConnectionUri() }),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
  }, CONTAINER_TIMEOUT_MS);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, CONTAINER_TIMEOUT_MS);

  it('reports liveness under the API prefix', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
