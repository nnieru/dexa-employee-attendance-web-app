import { z } from 'zod';
import { serviceNameSchema } from '../auth/service-name.js';

// Only the scheme is restricted. zod's default hostname check rejects single-label names such as
// employee-service, which is how docker compose addresses services, and IP literals.
// Credentials in the URL would be sent with every call and could reach logs, so they are refused.
// The pipe runs the credential check only after the URL check passes, so the URL always parses.
export const internalBaseUrlSchema = z
  .url({
    protocol: /^https?$/,
    error: 'must be an http or https URL',
  })
  .pipe(z.string().refine(hasNoUrlCredentials, { error: 'must not contain credentials' }));

function hasNoUrlCredentials(value: string): boolean {
  const url = new URL(value);
  return url.username === '' && url.password === '';
}

export const InternalServiceBaseUrlsSchema = z.partialRecord(
  serviceNameSchema,
  internalBaseUrlSchema,
);

export type InternalServiceBaseUrls = z.infer<typeof InternalServiceBaseUrlsSchema>;
