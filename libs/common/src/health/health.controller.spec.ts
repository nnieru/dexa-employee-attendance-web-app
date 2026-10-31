import type { HealthCheckResult, IHealthIndicator } from './health-indicator.interface.js';
import { HealthController, type HealthResponse } from './health.controller.js';
import { HealthIndicatorRegistry } from './health-indicator.registry.js';

const SERVICE_UNAVAILABLE = 503;

function indicatorReporting(name: string, result: HealthCheckResult): IHealthIndicator {
  return { name, check: () => result };
}

// Records the HTTP status the controller sets, so the test can assert the response code.
function recordingResponse(): {
  readonly statuses: number[];
  readonly response: { status(code: number): void };
} {
  const statuses: number[] = [];
  return { statuses, response: { status: (code: number) => statuses.push(code) } };
}

function healthOf(indicators: ReadonlyArray<IHealthIndicator>): {
  readonly body: HealthResponse;
  readonly statuses: number[];
} {
  const registry = new HealthIndicatorRegistry();
  indicators.forEach((indicator) => registry.register(indicator));
  const recorded = recordingResponse();
  const body = new HealthController(registry).getHealth(recorded.response);
  return { body, statuses: recorded.statuses };
}

describe('HealthController', () => {
  it.each([
    {
      condition: 'no indicator is registered',
      indicators: [],
    },
    {
      condition: 'every indicator is healthy',
      indicators: [
        indicatorReporting('queue', { status: 'healthy' }),
        indicatorReporting('database', { status: 'healthy' }),
      ],
    },
  ])('should answer 200 with status ok when $condition', ({ indicators }) => {
    const { body, statuses } = healthOf(indicators);

    expect(body).toEqual({ status: 'ok' });
    expect(statuses).toEqual([]);
  });

  it('should answer 503 with the degraded check and its reason when one indicator is degraded', () => {
    const { body, statuses } = healthOf([
      indicatorReporting('database', { status: 'healthy' }),
      indicatorReporting('dead-letter-archive', {
        status: 'degraded',
        reason: 'DEAD_LETTER_ARCHIVE_PAUSED',
      }),
    ]);

    expect(body).toEqual({
      status: 'degraded',
      checks: [{ name: 'dead-letter-archive', reason: 'DEAD_LETTER_ARCHIVE_PAUSED' }],
    });
    expect(statuses).toEqual([SERVICE_UNAVAILABLE]);
  });
});
