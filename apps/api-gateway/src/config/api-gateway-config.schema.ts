import { AuthConfigSchema, BaseConfigSchema, ServiceName } from '@dexa/common';
import { z } from 'zod';

// Only the scheme and the absence of credentials are checked here. zod's default hostname check rejects
// single-label names such as auth-service, which is how compose addresses the service.
const internalUrlSchema = z
  .url({ protocol: /^https?$/, error: 'must be an http or https URL' })
  .pipe(z.string().refine(hasNoUrlCredentials, { error: 'must not contain credentials' }));

// Credentials in the URL would be sent with every call and could reach logs.
function hasNoUrlCredentials(value: string): boolean {
  const url = new URL(value);
  return url.username === '' && url.password === '';
}

// The gateway's name in its internal tokens. The loader supplies it by default, and any other value is
// refused, so this process cannot sign tokens as another service.
const ownServiceNameSchema = z.literal(ServiceName.API_GATEWAY, {
  error: `must be ${ServiceName.API_GATEWAY}`,
});

export const ApiGatewayConfigSchema = z.intersection(
  BaseConfigSchema.extend({
    SERVICE_NAME: ownServiceNameSchema,
    AUTH_SERVICE_INTERNAL_URL: internalUrlSchema,
    EMPLOYEE_SERVICE_INTERNAL_URL: internalUrlSchema,
  }),
  AuthConfigSchema,
);

export type ApiGatewayConfig = z.infer<typeof ApiGatewayConfigSchema>;
