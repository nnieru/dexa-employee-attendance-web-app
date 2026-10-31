import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthIndicatorRegistry } from './health-indicator.registry.js';
import { HEALTH_INDICATOR_REGISTRY } from './health-indicator.interface.js';

// Exports the registry so a service's own module can register indicators against the same instance.
@Module({
  controllers: [HealthController],
  providers: [{ provide: HEALTH_INDICATOR_REGISTRY, useClass: HealthIndicatorRegistry }],
  exports: [HEALTH_INDICATOR_REGISTRY],
})
export class HealthModule {}
