import { types } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { IPasswordHasher } from './password-hasher.interface.js';

// Only argon2id is accepted. argon2.verify would also check argon2i and
// argon2d digests, so this prefix check is what keeps them out.
const ARGON2ID_HASH_PREFIX = '$argon2id$';

/**
 * Cost parameters come from the argon2 package defaults at the exact pinned version (0.45.1):
 * memoryCost 65536 KiB (64 MiB), timeCost 3, parallelism 4, a 16-byte random salt and a 32-byte
 * output. They are written into each hash, so a later change to the defaults affects only hashes
 * created after that change.
 */
@Injectable()
export class Argon2PasswordHasher implements IPasswordHasher {
  private readonly logger = new Logger(Argon2PasswordHasher.name);

  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    if (!hash.startsWith(ARGON2ID_HASH_PREFIX)) {
      return false;
    }

    try {
      return await argon2.verify(hash, password);
    } catch (error: unknown) {
      // argon2 has no error codes. A malformed digest throws a TypeError, or an Error such as
      // "Salt is too short" when a parameter is out of range. A host failure such as "Memory
      // allocation error" is also a plain Error, and only the English message tells the two apart.
      // Reporting every failure as a non-matching digest keeps a corrupt row from breaking login,
      // so the failure is logged to keep a host problem visible. Only the error class is logged:
      // parser messages can echo parts of the stored hash.
      this.logger.warn(`Password verification failed with ${describeErrorClass(error)}`);
      return false;
    }
  }
}

function describeErrorClass(error: unknown): string {
  return types.isNativeError(error) ? error.name : `a non-Error value (${typeof error})`;
}
