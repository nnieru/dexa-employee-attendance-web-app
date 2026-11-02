import {
  HEALTH_INDICATOR_REGISTRY,
  type HealthCheckResult,
  type IHealthIndicator,
  type IHealthIndicatorRegistry,
} from '@dexa/common';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DeadLetterConsumerStatus } from './dead-letter-consumer-status.js';

export const DEAD_LETTER_ARCHIVE_HEALTH_NAME = 'dead-letter-archive';
export const DEAD_LETTER_ARCHIVE_PAUSED_REASON = 'DEAD_LETTER_ARCHIVE_PAUSED';

/** Reports degraded while the archive consumer is paused after a transient failure. */
@Injectable()
export class DeadLetterHealthIndicator implements IHealthIndicator, OnModuleInit {
  readonly name = DEAD_LETTER_ARCHIVE_HEALTH_NAME;

  constructor(
    @Inject(HEALTH_INDICATOR_REGISTRY) private readonly registry: IHealthIndicatorRegistry,
    private readonly status: DeadLetterConsumerStatus,
  ) {}

  // Registers on module init, so the health route reports this indicator once the app is initialized.
  onModuleInit(): void {
    this.registry.register(this);
  }

  check(): HealthCheckResult {
    if (this.status.isPaused) {
      return { status: 'degraded', reason: DEAD_LETTER_ARCHIVE_PAUSED_REASON };
    }
    return { status: 'healthy' };
  }
}
