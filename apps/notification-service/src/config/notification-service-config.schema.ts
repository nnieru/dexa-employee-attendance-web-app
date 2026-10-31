import {
  AuthConfigSchema,
  BaseConfigSchema,
  internalBaseUrlSchema,
  ServiceName,
} from '@dexa/common';
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

// The name this service signs internal tokens with. The loader supplies it by default. Any other value is refused,
// because a process that signed as another service would impersonate it.
const ownServiceNameSchema = z.literal(ServiceName.NOTIFICATION_SERVICE, {
  error: `must be ${ServiceName.NOTIFICATION_SERVICE}`,
});

// The notification service consumes the event queue, writes the inbox, and resolves recipients and names through
// the internal routes of auth-service and employee-service. Its service token is signed with its own key. It holds
// no user token setting: the gateway checks users and forwards only its own signed token (D-51).
export const NotificationServiceConfigSchema = z.intersection(
  AuthConfigSchema,
  BaseConfigSchema.extend({
    SERVICE_NAME: ownServiceNameSchema,
    NOTIFICATION_DATABASE_URL: postgresUrlSchema,
    // The consumer declares its queue and dead-letter queue on this broker at startup (DATABASE §7.3).
    RABBITMQ_URL: rabbitMqUrlSchema,
    // Recipients are the active HR accounts that auth-service lists (DATABASE §7.3 step 1).
    AUTH_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
    // Password-change notifications name the employee through employee-service's batched lookup (T-EMP-10).
    EMPLOYEE_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
  }),
);

export type NotificationServiceConfig = z.infer<typeof NotificationServiceConfigSchema>;
