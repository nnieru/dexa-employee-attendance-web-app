import {
  AuthConfigSchema,
  BaseConfigSchema,
  internalBaseUrlSchema,
  ServiceName,
  UserJwtVerifierConfigSchema,
} from '@dexa/common';
import { z } from 'zod';

// The gateway's name in its internal tokens. The loader supplies it by default, and any other value is
// refused, so this process cannot sign tokens as another service.
const ownServiceNameSchema = z.literal(ServiceName.API_GATEWAY, {
  error: `must be ${ServiceName.API_GATEWAY}`,
});

// The browser docs stay off in production unless this variable explicitly turns them on, so a container
// with NODE_ENV=production can still serve Swagger for a local compose run (SWAGGER exposure).
const swaggerEnabledSchema = z.union([z.literal('true'), z.literal('false')]).optional();

// The gateway verifies end-user tokens (UserJwtVerifierConfigSchema) and signs the internal tokens it forwards
// with its own service key (AuthConfigSchema). It alone reads the user token settings (D-51).
export const ApiGatewayConfigSchema = z.intersection(
  z.intersection(
    BaseConfigSchema.extend({
      SERVICE_NAME: ownServiceNameSchema,
      SWAGGER_ENABLED: swaggerEnabledSchema,
      AUTH_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
      EMPLOYEE_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
      ATTENDANCE_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
      // The HR notification stream is proxied to notification-service (D-08). Only the stream uses this URL.
      NOTIFICATION_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
    }),
    AuthConfigSchema,
  ),
  UserJwtVerifierConfigSchema,
);

export type ApiGatewayConfig = z.infer<typeof ApiGatewayConfigSchema>;
