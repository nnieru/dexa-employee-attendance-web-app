import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { serviceNameSchema, type ServiceName } from './service-name.js';

const serviceTokenHeaderSchema = z.object({ kid: serviceNameSchema });

/**
 * Reads the kid from a token header without checking the signature. The result only chooses which
 * public key verifies the token. The signature check is what authenticates the caller, so the
 * name returned here is never trusted on its own.
 */
export function readServiceTokenKid(token: unknown): ServiceName | undefined {
  if (typeof token !== 'string') return undefined;
  const [encodedHeader] = token.split('.');
  if (encodedHeader === undefined) return undefined;
  const header = parseJson(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
  const parsedHeader = serviceTokenHeaderSchema.safeParse(header);
  return parsedHeader.success ? parsedHeader.data.kid : undefined;
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    // A header that is not JSON carries no kid, so the token is refused like any unknown kid.
    return undefined;
  }
}
