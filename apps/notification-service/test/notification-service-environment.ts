import { ServiceName } from '@dexa/common';
import { authEnvironmentFor, generateAuthKeySet, type AuthKeySet } from './auth-key-set.js';

// The variables every notification-service start needs. Tests override only what they vary.
const TEST_DATABASE_URL =
  'postgres://notification_app:test-only-password@postgres:5432/notification_db';
// Nothing listens here. Specs that consume events override IAuthClient and IEmployeeClient instead of calling them.
const TEST_AUTH_SERVICE_URL = 'http://auth-service:3000';
const TEST_EMPLOYEE_SERVICE_URL = 'http://employee-service:3000';
// Nothing listens here. Specs that consume events pass their own RABBITMQ_URL.
const UNREACHABLE_BROKER_URL = 'amqp://notification-service:unused-password@127.0.0.1:1';

// Generated once per test process, so every environment and every signed token agree on the keys.
// Test-only key material, never stored in the repository.
let authKeys: AuthKeySet | undefined;

/** The key set behind notificationServiceEnvironment. */
export function notificationServiceAuthKeys(): AuthKeySet {
  authKeys ??= generateAuthKeySet();
  return authKeys;
}

export function notificationServiceEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    BUSINESS_TIMEZONE: 'Asia/Jakarta',
    NOTIFICATION_DATABASE_URL: TEST_DATABASE_URL,
    RABBITMQ_URL: UNREACHABLE_BROKER_URL,
    AUTH_SERVICE_INTERNAL_URL: TEST_AUTH_SERVICE_URL,
    EMPLOYEE_SERVICE_INTERNAL_URL: TEST_EMPLOYEE_SERVICE_URL,
    ...authEnvironmentFor(notificationServiceAuthKeys(), ServiceName.NOTIFICATION_SERVICE),
    ...overrides,
  };
}
