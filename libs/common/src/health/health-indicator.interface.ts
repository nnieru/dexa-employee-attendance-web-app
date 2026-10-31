/**
 * A component's health. `reason` is a short code such as DEAD_LETTER_ARCHIVE_PAUSED. It never carries personal
 * data, message bodies or error text.
 */
export type HealthCheckResult =
  { readonly status: 'healthy' } | { readonly status: 'degraded'; readonly reason: string };

/** One component that reports its own health. A service implements it and registers the instance. */
export interface IHealthIndicator {
  readonly name: string;
  check(): HealthCheckResult;
}

/** Holds the indicators of one application, so the health route can report all of them. */
export interface IHealthIndicatorRegistry {
  register(indicator: IHealthIndicator): void;
  /** Runs every registered indicator and returns each one's name with its result. */
  checkAll(): ReadonlyArray<{ readonly name: string; readonly result: HealthCheckResult }>;
}

export const HEALTH_INDICATOR_REGISTRY = Symbol('IHealthIndicatorRegistry');
