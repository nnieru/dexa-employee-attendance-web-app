import { ServiceName, parseConfig } from '@dexa/common';
import { AuthServiceConfigSchema, type AuthServiceConfig } from './auth-service-config.schema.js';

/**
 * Reads this service's settings from the environment. A blank or unset SERVICE_NAME means this
 * service's own name, so one shared .env file serves every service. The schema refuses any other value.
 */
export function loadAuthServiceConfig(): AuthServiceConfig {
  const serviceName = process.env.SERVICE_NAME || ServiceName.AUTH_SERVICE;
  return parseConfig(AuthServiceConfigSchema, { ...process.env, SERVICE_NAME: serviceName });
}
