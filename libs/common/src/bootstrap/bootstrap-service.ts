import { NestFactory } from '@nestjs/core';
import type { Type } from '@nestjs/common';
import { BaseConfigSchema } from '../config/base-config.schema.js';
import { parseConfig } from '../config/parse-config.js';
import { configureApp } from './configure-app.js';

type BootstrapOptions = {
  module: Type<unknown>;
  defaultPort: number;
};

export async function bootstrapService({ module, defaultPort }: BootstrapOptions): Promise<void> {
  const config = parseConfig(BaseConfigSchema);
  const app = await NestFactory.create(module);
  configureApp(app, config);
  await app.listen(config.PORT ?? defaultPort, config.HOST);
}
