import type { ServiceName } from './service-name.js';

/** Mints the short-lived token a caller presents to one target service's internal routes. */
export interface IServiceTokenSigner {
  signFor(audience: ServiceName): Promise<string>;
}

export const SERVICE_TOKEN_SIGNER = Symbol('IServiceTokenSigner');
