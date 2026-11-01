import 'reflect-metadata';
import { bootstrapService } from '@dexa/common';
import { createAppModule } from './app.module.js';
import { loadApiGatewayConfig } from './config/load-api-gateway-config.js';
import { setupSwaggerDocs } from './docs/setup-swagger-docs.js';

const config = loadApiGatewayConfig();
const boot = await bootstrapService({
  module: createAppModule(config),
  defaultPort: 3000,
  // The production default keeps the docs off (ARCHITECTURE): they load only under development.
  isSwaggerEnabled: config.NODE_ENV !== 'production',
});
if (config.NODE_ENV !== 'production') {
  setupSwaggerDocs(boot.app);
}
