import { BaseConfigSchema } from '@dexa/common';
import { z } from 'zod';

// pg silently falls back to local defaults for a missing host or database name, so both are required here.
// Same rule as the other services' database URLs (kept local so this service owns its boundary).
const postgresUrlSchema = z
  .url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// connection URL',
  })
  .pipe(z.string().refine(hasHostAndDatabase, { error: 'must name a host and a database' }));

// The broker URL carries credentials. A failure names the field only, never the URL.
const rabbitMqUrlSchema = z.url({
  protocol: /^amqps?$/,
  error: 'must be an amqp:// or amqps:// connection URL',
});

function hasHostAndDatabase(value: string): boolean {
  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  return url.hostname !== '' && databaseName !== '';
}

// The audit worker consumes the event queue and writes the audit ledger. It signs and verifies no tokens,
// so it has no token settings.
export const AuditWorkerConfigSchema = BaseConfigSchema.extend({
  AUDIT_DATABASE_URL: postgresUrlSchema,
  // The consumer declares its queue and dead-letter queue on this broker at startup (DATABASE §6.2).
  RABBITMQ_URL: rabbitMqUrlSchema,
});

export type AuditWorkerConfig = z.infer<typeof AuditWorkerConfigSchema>;
