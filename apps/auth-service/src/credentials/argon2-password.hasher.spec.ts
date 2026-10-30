import * as argon2 from 'argon2';
import { Argon2PasswordHasher } from './argon2-password.hasher.js';

const PASSWORD = 'abcdef12';
const WRONG_PASSWORD = 'abcdef13';
const BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('should return an argon2id hash when a password is hashed', async () => {
    await expect(hasher.hash(PASSWORD)).resolves.toMatch(/^\$argon2id\$/);
  });

  it('should return a hash that does not contain the password when hashing', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(hash).not.toContain(PASSWORD);
  });

  it('should return a different hash on each call when the same password is hashed', async () => {
    const firstHash = await hasher.hash(PASSWORD);
    const secondHash = await hasher.hash(PASSWORD);

    expect(firstHash).not.toBe(secondHash);
  });

  it.each([
    { condition: 'the password is the one that was hashed', candidate: PASSWORD, expected: true },
    { condition: 'the password is different', candidate: WRONG_PASSWORD, expected: false },
  ])('should resolve $expected when $condition', async ({ candidate, expected }) => {
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.verify(hash, candidate)).resolves.toBe(expected);
  });

  it.each([
    { condition: 'the hash is empty', hash: '' },
    { condition: 'the hash has no algorithm prefix', hash: 'not-a-hash' },
    { condition: 'the hash is a bcrypt string', hash: BCRYPT_HASH },
    { condition: 'the hash is argon2id with no parameters, salt or digest', hash: '$argon2id$' },
  ])('should resolve false without throwing when $condition', async ({ hash }) => {
    await expect(hasher.verify(hash, PASSWORD)).resolves.toBe(false);
  });

  it('should resolve false without throwing when a cost parameter is out of range', async () => {
    const hash = await hasher.hash(PASSWORD);
    const outOfRangeHash = hash.replace(/m=\d+/, 'm=0');

    await expect(hasher.verify(outOfRangeHash, PASSWORD)).resolves.toBe(false);
  });

  it('should resolve false when the hash is an argon2i digest of the same password', async () => {
    const argon2iHash = await argon2.hash(PASSWORD, { type: argon2.argon2i });

    await expect(hasher.verify(argon2iHash, PASSWORD)).resolves.toBe(false);
  });
});
