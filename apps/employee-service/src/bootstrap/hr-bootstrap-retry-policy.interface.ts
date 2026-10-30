export const HR_BOOTSTRAP_RETRY_POLICY = Symbol('HR_BOOTSTRAP_RETRY_POLICY');

/**
 * Bounds the wait between attempts. The delay starts at initialDelayMilliseconds and doubles after each
 * failed attempt, up to maxDelayMilliseconds. Tests substitute a policy in milliseconds.
 */
export type HrBootstrapRetryPolicy = {
  readonly initialDelayMilliseconds: number;
  readonly maxDelayMilliseconds: number;
};
