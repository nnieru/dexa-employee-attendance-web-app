import { Injectable } from '@nestjs/common';
import type {
  HealthCheckResult,
  IHealthIndicator,
  IHealthIndicatorRegistry,
} from './health-indicator.interface.js';

@Injectable()
export class HealthIndicatorRegistry implements IHealthIndicatorRegistry {
  private readonly indicators: IHealthIndicator[] = [];

  register(indicator: IHealthIndicator): void {
    this.indicators.push(indicator);
  }

  checkAll(): ReadonlyArray<{ readonly name: string; readonly result: HealthCheckResult }> {
    return this.indicators.map((indicator) => ({
      name: indicator.name,
      result: indicator.check(),
    }));
  }
}
