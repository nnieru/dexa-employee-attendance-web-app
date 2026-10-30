// The variables every employee-service start needs. Tests override only what they vary.
const TEST_DATABASE_URL = 'postgres://employee_app:test-only-password@postgres:5432/employee_db';

export function employeeServiceEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    BUSINESS_TIMEZONE: 'Asia/Jakarta',
    EMPLOYEE_DATABASE_URL: TEST_DATABASE_URL,
    ...overrides,
  };
}
