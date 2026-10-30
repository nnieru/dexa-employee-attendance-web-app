import 'reflect-metadata';
import { bootstrapService } from '@dexa/common';
import { createAppModule } from './app.module.js';
import { loadApiGatewayConfig } from './config/load-api-gateway-config.js';

await bootstrapService({ module: createAppModule(loadApiGatewayConfig()), defaultPort: 3000 });
