import 'reflect-metadata';
import { bootstrapService } from '@dexa/common';
import { createAppModule } from './app.module.js';
import { loadApiGatewayConfig } from './config/load-api-gateway-config.js';
import { setupSwaggerDocs } from './docs/setup-swagger-docs.js';

const config = loadApiGatewayConfig();
// Production keeps the docs off unless SWAGGER_ENABLED=true turns them on for a local run (ARCHITECTURE).
const isSwaggerEnabled =
  config.SWAGGER_ENABLED === undefined
    ? config.NODE_ENV !== 'production'
    : config.SWAGGER_ENABLED === 'true';
const boot = await bootstrapService({
  module: createAppModule(config),
  defaultPort: 3000,
  // The production default keeps the docs off (ARCHITECTURE): they load only under development.
  isSwaggerEnabled,
});
if (isSwaggerEnabled) {
  setupSwaggerDocs(boot.app);
}
