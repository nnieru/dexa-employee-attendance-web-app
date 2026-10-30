import type { EmployeeServiceConfig } from '../config/employee-service-config.schema.js';

export type HrBootstrapSettings = {
  readonly email: string;
  readonly name: string;
  readonly positionCode: string;
};

/**
 * Returns the bootstrap HR settings, or undefined when they are not configured. The config schema accepts all
 * three values or none, so a partial set cannot reach this function from a validated config.
 */
export function resolveHrBootstrapSettings(
  config: EmployeeServiceConfig,
): HrBootstrapSettings | undefined {
  const email = config.EMPLOYEE_BOOTSTRAP_HR_EMAIL;
  const name = config.EMPLOYEE_BOOTSTRAP_HR_NAME;
  const positionCode = config.EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE;
  if (email === undefined || name === undefined || positionCode === undefined) return undefined;
  return { email, name, positionCode };
}
