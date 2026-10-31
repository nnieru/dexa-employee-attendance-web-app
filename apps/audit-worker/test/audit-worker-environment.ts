// The variables every audit-worker start needs. Tests override only what they vary.
const TEST_DATABASE_URL = 'postgres://audit_app:test-only-password@postgres:5432/audit_db';
// Nothing listens here. Specs that consume events pass their own RABBITMQ_URL.
const UNREACHABLE_BROKER_URL = 'amqp://audit-worker:unused-password@127.0.0.1:1';

export function auditWorkerEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    BUSINESS_TIMEZONE: 'Asia/Jakarta',
    AUDIT_DATABASE_URL: TEST_DATABASE_URL,
    RABBITMQ_URL: UNREACHABLE_BROKER_URL,
    ...overrides,
  };
}
