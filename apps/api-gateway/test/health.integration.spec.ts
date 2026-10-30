import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp, parseConfig, ServiceName } from '@dexa/common';
import request from 'supertest';
import { createAppModule } from '../src/app.module.js';
import { ApiGatewayConfigSchema } from '../src/config/api-gateway-config.schema.js';
import { authEnvironmentFor, generateAuthKeySet } from './auth-key-set.js';

describe('api-gateway health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Health does not call auth-service, so the URL only has to be a valid internal address.
    const config = parseConfig(ApiGatewayConfigSchema, {
      BUSINESS_TIMEZONE: 'Asia/Jakarta',
      ...authEnvironmentFor(generateAuthKeySet(), ServiceName.API_GATEWAY),
      AUTH_SERVICE_INTERNAL_URL: 'http://auth-service:3000',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [createAppModule(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { CORS_ORIGINS: [] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports liveness under the API prefix', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
