import { loginRequestSchema, loginResponseSchema } from './login.schema.js';
import { Portal } from './portal.js';
import { Role } from './role.js';

const VALID_REQUEST = {
  email: 'hr.admin@dexa.test',
  password: 'old-password',
  portal: Portal.HR,
};
const VALID_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const VALID_RESPONSE = {
  accessToken: 'header.payload.signature',
  tokenType: 'Bearer',
  expiresIn: 3600,
  account: { id: VALID_ACCOUNT_ID, email: 'hr.admin@dexa.test', role: Role.HR },
};
// Two characters over the 254-character limit on company email.
const OVER_LIMIT_EMAIL = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;

describe('loginRequestSchema', () => {
  it('should return the email trimmed when the request has surrounding spaces', () => {
    const parsed = loginRequestSchema.parse({
      ...VALID_REQUEST,
      email: '  hr.admin@dexa.test  ',
    });

    expect(parsed).toEqual(VALID_REQUEST);
  });

  it('should accept the password unchanged when it fails the password policy', () => {
    // Passwords set before the policy existed must still sign in.
    expect(loginRequestSchema.parse({ ...VALID_REQUEST, password: 'abc' }).password).toBe('abc');
  });

  it.each([
    {
      condition: 'an unknown field is present',
      body: { ...VALID_REQUEST, accountId: VALID_ACCOUNT_ID },
    },
    { condition: 'the portal is not a known portal', body: { ...VALID_REQUEST, portal: 'ADMIN' } },
    { condition: 'the portal is missing', body: { email: VALID_REQUEST.email, password: 'x' } },
    { condition: 'the email is not an address', body: { ...VALID_REQUEST, email: 'not-an-email' } },
    {
      condition: 'the email is longer than 254 characters',
      body: { ...VALID_REQUEST, email: OVER_LIMIT_EMAIL },
    },
    { condition: 'the password is empty', body: { ...VALID_REQUEST, password: '' } },
    {
      condition: 'the password is longer than 1024 characters',
      body: { ...VALID_REQUEST, password: 'p'.repeat(1025) },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(loginRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('loginResponseSchema', () => {
  it('should accept the response when it has a bearer token and an account', () => {
    expect(loginResponseSchema.parse(VALID_RESPONSE)).toEqual(VALID_RESPONSE);
  });

  it.each([
    { condition: 'the token type is not Bearer', body: { ...VALID_RESPONSE, tokenType: 'Basic' } },
    {
      condition: 'the account role is not a known role',
      body: { ...VALID_RESPONSE, account: { ...VALID_RESPONSE.account, role: 'ADMIN' } },
    },
    {
      condition: 'the account ID is not a UUID',
      body: { ...VALID_RESPONSE, account: { ...VALID_RESPONSE.account, id: 'account-1' } },
    },
  ])('should reject the response when $condition', ({ body }) => {
    expect(loginResponseSchema.safeParse(body).success).toBe(false);
  });
});
