import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import {
  HEALTH_INDICATOR_REGISTRY,
  type IHealthIndicatorRegistry,
} from './health-indicator.interface.js';

export type HealthResponse =
  | { readonly status: 'ok' }
  | {
      readonly status: 'degraded';
      readonly checks: ReadonlyArray<{ readonly name: string; readonly reason: string }>;
    };

// Declared locally so libs/common does not take a dependency on express types (see the exception filter).
type HealthHttpResponse = { status(code: number): void };

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HEALTH_INDICATOR_REGISTRY) private readonly indicators: IHealthIndicatorRegistry,
  ) {}

  /**
   * Answers 200 { status: 'ok' } when every registered indicator is healthy, or none is registered. While an
   * indicator is degraded it answers 503 with the degraded checks. The body is returned, not thrown, so the global
   * exception filter does not reshape it.
   */
  @Public()
  @Get()
  getHealth(@Res({ passthrough: true }) response: HealthHttpResponse): HealthResponse {
    const degradedChecks = this.indicators
      .checkAll()
      .flatMap((check) =>
        check.result.status === 'degraded'
          ? [{ name: check.name, reason: check.result.reason }]
          : [],
      );
    if (degradedChecks.length === 0) {
      return { status: 'ok' };
    }
    response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: 'degraded', checks: degradedChecks };
  }
}
