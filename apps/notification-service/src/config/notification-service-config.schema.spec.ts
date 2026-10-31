import { parseConfig } from '@dexa/common';
import { notificationServiceEnvironment } from '../../test/notification-service-environment.js';
import { NotificationServiceConfigSchema } from './notification-service-config.schema.js';

function parseWith(overrides: Record<string, string | undefined>) {
  return parseConfig(NotificationServiceConfigSchema, notificationServiceEnvironment(overrides));
}

function rejectedFields(overrides: Record<string, string | undefined>): string[] {
  try {
    parseWith(overrides);
  } catch (error) {
    return error instanceof Error ? [error.message] : [];
  }
  throw new Error('Expected the configuration to be rejected, but it was accepted.');
}

describe('NotificationServiceConfigSchema', () => {
  it('should accept a complete environment', () => {
    expect(parseWith({}).SERVICE_NAME).toBe('notification-service');
  });

  it.each([
    {
      field: 'NOTIFICATION_DATABASE_URL',
      value: 'mysql://notification_app@postgres/notification_db',
    },
    { field: 'NOTIFICATION_DATABASE_URL', value: 'postgres://notification_app@postgres:5432' },
    { field: 'NOTIFICATION_DATABASE_URL', value: undefined },
    { field: 'RABBITMQ_URL', value: 'http://rabbitmq:15672' },
    { field: 'RABBITMQ_URL', value: undefined },
    { field: 'AUTH_SERVICE_INTERNAL_URL', value: 'ftp://auth-service:3000' },
    { field: 'AUTH_SERVICE_INTERNAL_URL', value: undefined },
    { field: 'EMPLOYEE_SERVICE_INTERNAL_URL', value: 'http://user:secret@employee-service:3000' },
    { field: 'EMPLOYEE_SERVICE_INTERNAL_URL', value: undefined },
    { field: 'SERVICE_NAME', value: 'audit-worker' },
  ])('should refuse the environment when $field is $value', ({ field, value }) => {
    expect(rejectedFields({ [field]: value }).join('\n')).toContain(field);
  });
});
