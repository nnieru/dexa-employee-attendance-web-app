import 'reflect-metadata';
import { bootstrapService, parseConfig } from '@dexa/common';
import { createAppModule } from './app.module.js';
import { AttendanceServiceConfigSchema } from './config/attendance-service-config.schema.js';

await bootstrapService({
  module: createAppModule(parseConfig(AttendanceServiceConfigSchema)),
  defaultPort: 3003,
});
