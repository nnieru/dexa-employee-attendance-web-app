import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';

@Controller('health')
export class HealthController {
  /** Liveness only. Dependency checks belong to a readiness endpoint added with real dependencies. */
  @Public()
  @Get()
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
