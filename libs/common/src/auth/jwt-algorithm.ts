// Pinned instead of read from the token header. A verifier that trusts the header's alg can be
// steered to "none" or to a key type it did not expect, so each token kind allows exactly one.
export const USER_JWT_ALGORITHM = 'RS256';
export const SERVICE_JWT_ALGORITHM = 'ES256';
