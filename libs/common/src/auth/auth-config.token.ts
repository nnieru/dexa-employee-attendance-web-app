// Injected into the strategies and the signer, so the auth library never reads process.env itself.
export const AUTH_CONFIG = Symbol('AuthConfig');

// The user token settings that api-gateway verifies with. Other services do not provide it (D-51).
export const USER_JWT_VERIFIER_CONFIG = Symbol('UserJwtVerifierConfig');
