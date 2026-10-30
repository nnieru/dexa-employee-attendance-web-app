// A real argon2id hash of a random value that nobody holds. Sign-in verifies against it when the email
// is unknown, so an unknown email costs the same time as a known one.
export const DUMMY_PASSWORD_HASH = Symbol('DUMMY_PASSWORD_HASH');
