import { ServiceName } from '@dexa/common';
import { authEnvironmentFor, generateAuthKeySet, type AuthKeySet } from './auth-key-set.js';

// The variables every attendance-service start needs. Tests override only what they vary.
const TEST_DATABASE_URL =
  'postgres://attendance_app:test-only-password@postgres:5432/attendance_db';
const TEST_RABBITMQ_URL = 'amqp://dexa:test-only-password@rabbitmq:5672';
// Nothing listens here. Specs that need account status override ACCOUNT_STATUS_READER instead of calling it.
const TEST_AUTH_SERVICE_URL = 'http://auth-service:3000';
// Nothing listens here either. Specs that list attendance for HR override EMPLOYEE_CLIENT instead of calling it.
const TEST_EMPLOYEE_SERVICE_URL = 'http://employee-service:3000';

// Generated once per test process, so every environment and every signed token agree on the keys.
// Test-only key material, never stored in the repository.
let authKeys: AuthKeySet | undefined;

/** The key set behind attendanceServiceEnvironment, which tests use to sign gateway tokens. */
export function attendanceServiceAuthKeys(): AuthKeySet {
  authKeys ??= generateAuthKeySet();
  return authKeys;
}

export function attendanceServiceEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    BUSINESS_TIMEZONE: 'Asia/Jakarta',
    ATTENDANCE_DATABASE_URL: TEST_DATABASE_URL,
    RABBITMQ_URL: TEST_RABBITMQ_URL,
    AUTH_SERVICE_INTERNAL_URL: TEST_AUTH_SERVICE_URL,
    EMPLOYEE_SERVICE_INTERNAL_URL: TEST_EMPLOYEE_SERVICE_URL,
    ...authEnvironmentFor(attendanceServiceAuthKeys(), ServiceName.ATTENDANCE_SERVICE),
    ...overrides,
  };
}
