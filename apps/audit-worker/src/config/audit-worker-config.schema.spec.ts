import { AuditWorkerConfigSchema } from './audit-worker-config.schema.js';

const VALID_ENVIRONMENT = {
  NODE_ENV: 'production',
  BUSINESS_TIMEZONE: 'Asia/Jakarta',
  AUDIT_DATABASE_URL: 'postgres://audit_app:secret@postgres:5432/audit_db',
  RABBITMQ_URL: 'amqp://dexa:secret@rabbitmq:5672',
};

describe('AuditWorkerConfigSchema', () => {
  it('should accept a complete environment', () => {
    const result = AuditWorkerConfigSchema.safeParse(VALID_ENVIRONMENT);

    expect(result.success).toBe(true);
  });

  it.each([
    { field: 'AUDIT_DATABASE_URL', value: 'mysql://audit_app@postgres/audit_db' },
    { field: 'AUDIT_DATABASE_URL', value: 'postgres://audit_app@postgres:5432' },
    { field: 'AUDIT_DATABASE_URL', value: undefined },
    { field: 'RABBITMQ_URL', value: 'http://rabbitmq:15672' },
    { field: 'RABBITMQ_URL', value: undefined },
  ])('should refuse the environment when $field is $value', ({ field, value }) => {
    const result = AuditWorkerConfigSchema.safeParse({ ...VALID_ENVIRONMENT, [field]: value });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(field);
  });
});
