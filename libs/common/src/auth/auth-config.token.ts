// Injected into the strategies and the signer, so the auth library never reads process.env itself.
export const AUTH_CONFIG = Symbol('AuthConfig');
