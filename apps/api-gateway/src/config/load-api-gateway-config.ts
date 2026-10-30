import { ServiceName, parseConfig } from '@dexa/common';
import { ApiGatewayConfigSchema, type ApiGatewayConfig } from './api-gateway-config.schema.js';

/**
 * Reads the gateway's settings from the environment. A blank or unset SERVICE_NAME means the gateway's
 * own name, so one shared .env file serves every service. The schema refuses any other value.
 */
export function loadApiGatewayConfig(): ApiGatewayConfig {
  const serviceName = process.env.SERVICE_NAME || ServiceName.API_GATEWAY;
  // The gateway checks user tokens with the public key only. Clearing the private key here keeps it out
  // of this process even when a shared .env file contains it, so the gateway cannot mint user tokens.
  return parseConfig(ApiGatewayConfigSchema, {
    ...process.env,
    SERVICE_NAME: serviceName,
    USER_JWT_PRIVATE_KEY: undefined,
  });
}
