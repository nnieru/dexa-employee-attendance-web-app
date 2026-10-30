import 'reflect-metadata';
import { bootstrapService } from '@dexa/common';
import { createAppModule } from './app.module.js';
import { loadAuthServiceConfig } from './config/load-auth-service-config.js';

await bootstrapService({ module: createAppModule(loadAuthServiceConfig()), defaultPort: 3001 });
