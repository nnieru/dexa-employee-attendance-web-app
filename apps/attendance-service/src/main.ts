import 'reflect-metadata';
import { bootstrapService } from '@dexa/common';
import { createAppModule } from './app.module.js';
import { loadAttendanceServiceConfig } from './config/load-attendance-service-config.js';

await bootstrapService({
  module: createAppModule(loadAttendanceServiceConfig()),
  defaultPort: 3003,
});
