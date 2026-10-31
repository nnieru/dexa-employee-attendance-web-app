import type { AuthenticatedUser } from './authenticated-principal.js';
import type { ServiceName } from './service-name.js';

/**
 * Mints the short-lived token a caller presents to one target service's internal routes. With onBehalfOf, the
 * token also names the end user that api-gateway acts for (D-51); only api-gateway may mint such a token.
 */
export interface IServiceTokenSigner {
  signFor(audience: ServiceName, onBehalfOf?: AuthenticatedUser): Promise<string>;
}

export const SERVICE_TOKEN_SIGNER = Symbol('IServiceTokenSigner');
