import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@dexa/contracts';
import helmet from 'helmet';
import type { BaseConfig } from '../config/base-config.schema.js';
import { DomainExceptionFilter } from '../errors/domain-exception.filter.js';

type ConfigureAppOptions = {
  /** True when the browser docs are mounted, so the Helmet content-security policy lets their scripts run. */
  isSwaggerEnabled?: boolean;
};

/** Shared HTTP configuration, applied identically in production and in integration tests. */
export function configureApp(
  app: INestApplication,
  config: Pick<BaseConfig, 'CORS_ORIGINS'>,
  { isSwaggerEnabled }: ConfigureAppOptions = {},
): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet(isSwaggerEnabled ? { contentSecurityPolicy: false } : undefined));
  app.enableCors({ origin: config.CORS_ORIGINS });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();
}
