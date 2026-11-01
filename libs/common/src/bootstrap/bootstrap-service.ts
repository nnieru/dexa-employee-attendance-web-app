import { NestFactory } from '@nestjs/core';
import type { INestApplication, Type } from '@nestjs/common';
import { BaseConfigSchema, type BaseConfig } from '../config/base-config.schema.js';
import { parseConfig } from '../config/parse-config.js';
import { configureApp } from './configure-app.js';

type BootstrapOptions = {
  module: Type<unknown>;
  defaultPort: number;
  /** True when the docs are mounted, so the Helmet CSP lets their scripts run (Swagger exposure, ARCHITECTURE). */
  isSwaggerEnabled?: boolean;
};

/** What a main entry may use after boot, for example the gateway mounting its OpenAPI document. */
export type BootstrappedService = { readonly app: INestApplication; readonly config: BaseConfig };

export async function bootstrapService({
  module,
  defaultPort,
  isSwaggerEnabled,
}: BootstrapOptions): Promise<BootstrappedService> {
  const config = parseConfig(BaseConfigSchema);
  const app = await NestFactory.create(module);
  configureApp(app, config, { isSwaggerEnabled });
  await app.listen(config.PORT ?? defaultPort, config.HOST);
  return { app, config };
}
