import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@dexa/contracts';
import helmet from 'helmet';
import type { BaseConfig } from '../config/base-config.schema.js';

/** Shared HTTP configuration, applied identically in production and in integration tests. */
export function configureApp(
  app: INestApplication,
  config: Pick<BaseConfig, 'CORS_ORIGINS'>,
): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.enableCors({ origin: config.CORS_ORIGINS });
  app.enableShutdownHooks();
}
