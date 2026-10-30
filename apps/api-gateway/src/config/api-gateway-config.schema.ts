import {
  AuthConfigSchema,
  BaseConfigSchema,
  internalBaseUrlSchema,
  ServiceName,
} from '@dexa/common';
import { z } from 'zod';

// The gateway's name in its internal tokens. The loader supplies it by default, and any other value is
// refused, so this process cannot sign tokens as another service.
const ownServiceNameSchema = z.literal(ServiceName.API_GATEWAY, {
  error: `must be ${ServiceName.API_GATEWAY}`,
});

export const ApiGatewayConfigSchema = z.intersection(
  BaseConfigSchema.extend({
    SERVICE_NAME: ownServiceNameSchema,
    AUTH_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
    EMPLOYEE_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
    ATTENDANCE_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
  }),
  AuthConfigSchema,
);

export type ApiGatewayConfig = z.infer<typeof ApiGatewayConfigSchema>;
