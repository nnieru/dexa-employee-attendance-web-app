// The variables every attendance-service start needs. Tests override only what they vary.
const TEST_DATABASE_URL =
  'postgres://attendance_app:test-only-password@postgres:5432/attendance_db';

export function attendanceServiceEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    BUSINESS_TIMEZONE: 'Asia/Jakarta',
    ATTENDANCE_DATABASE_URL: TEST_DATABASE_URL,
    ...overrides,
  };
}
