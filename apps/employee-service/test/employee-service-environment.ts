import { ServiceName } from '@dexa/common';
import { authEnvironmentFor, generateAuthKeySet, type AuthKeySet } from './auth-key-set.js';

// The variables every employee-service start needs. Tests override only what they vary.
const TEST_DATABASE_URL = 'postgres://employee_app:test-only-password@postgres:5432/employee_db';
// Nothing listens here. Specs that need account status override ACCOUNT_STATUS_READER instead of calling it.
const TEST_AUTH_SERVICE_URL = 'http://auth-service:3000';

// Generated once per test process, so every environment and every signed token agree on the keys.
// Test-only key material, never stored in the repository.
let authKeys: AuthKeySet | undefined;

/** The key set behind employeeServiceEnvironment, which tests use to sign user tokens. */
export function employeeServiceAuthKeys(): AuthKeySet {
  authKeys ??= generateAuthKeySet();
  return authKeys;
}

export function employeeServiceEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    BUSINESS_TIMEZONE: 'Asia/Jakarta',
    EMPLOYEE_DATABASE_URL: TEST_DATABASE_URL,
    AUTH_SERVICE_INTERNAL_URL: TEST_AUTH_SERVICE_URL,
    ...authEnvironmentFor(employeeServiceAuthKeys(), ServiceName.EMPLOYEE_SERVICE),
    ...overrides,
  };
}
