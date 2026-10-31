import { ServiceName, parseConfig } from '@dexa/common';
import {
  NotificationServiceConfigSchema,
  type NotificationServiceConfig,
} from './notification-service-config.schema.js';

/**
 * Reads this service's settings from the environment and fails startup when any of them is invalid. A blank or unset
 * SERVICE_NAME means this service's own name, so one shared .env file serves every service. The schema refuses any
 * other value.
 */
export function loadNotificationServiceConfig(): NotificationServiceConfig {
  const serviceName = process.env.SERVICE_NAME || ServiceName.NOTIFICATION_SERVICE;
  // Only auth-service signs user tokens. Clearing the private key keeps it out of this process even when a shared
  // .env file contains it, so this service cannot mint user tokens.
  return parseConfig(NotificationServiceConfigSchema, {
    ...process.env,
    SERVICE_NAME: serviceName,
    USER_JWT_PRIVATE_KEY: undefined,
  });
}
