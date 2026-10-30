/**
 * Hashes account passwords and checks a candidate password against a stored hash. Plaintext
 * passwords and hashes must never be logged or placed in an error message.
 */
export interface IPasswordHasher {
  /** Returns a self-describing hash: the salt and cost parameters are part of the string. */
  hash(password: string): Promise<string>;
  /**
   * Resolves false, rather than rejecting, when the stored hash is malformed. A corrupt row then
   * reads as a failed login instead of an error that could break the login path.
   */
  verify(hash: string, password: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('IPasswordHasher');
