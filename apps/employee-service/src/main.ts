import 'reflect-metadata';
import { bootstrapService } from '@dexa/common';
import { createAppModule } from './app.module.js';
import { loadEmployeeServiceConfig } from './config/load-employee-service-config.js';

await bootstrapService({ module: createAppModule(loadEmployeeServiceConfig()), defaultPort: 3002 });
