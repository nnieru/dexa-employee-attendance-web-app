import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  /** Liveness only. Dependency checks belong to a readiness endpoint added with real dependencies. */
  @Get()
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
