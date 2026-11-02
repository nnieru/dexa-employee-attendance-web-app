import { createSessionResponseSchema } from './login.schema.js';
import { refreshSessionRequestSchema } from './refresh-session.schema.js';
import { Role } from './role.js';

const VALID_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const VALID_SESSION = {
  accessToken: 'header.payload.signature',
  refreshToken: 'refresh-header.refresh-payload.refresh-signature',
  tokenType: 'Bearer',
  expiresIn: 3600,
  account: { id: VALID_ACCOUNT_ID, email: 'hr.admin@dexa.test', role: Role.HR },
};

describe('createSessionResponseSchema', () => {
  it('should accept the internal answer when it carries both tokens and the account', () => {
    expect(createSessionResponseSchema.parse(VALID_SESSION)).toEqual(VALID_SESSION);
  });

  it('should reject the answer when the refresh token is missing', () => {
    const withoutRefreshToken = { ...VALID_SESSION } as Record<string, unknown>;
    delete withoutRefreshToken.refreshToken;
    expect(createSessionResponseSchema.safeParse(withoutRefreshToken).success).toBe(false);
  });
});

describe('refreshSessionRequestSchema', () => {
  it('should accept the body when it carries only the refresh token', () => {
    const body = { refreshToken: VALID_SESSION.refreshToken };
    expect(refreshSessionRequestSchema.parse(body)).toEqual(body);
  });

  it.each([
    { condition: 'the token is missing', body: {} },
    { condition: 'the token is empty', body: { refreshToken: '' } },
    {
      condition: 'an account id is smuggled in',
      body: { refreshToken: 't', accountId: VALID_ACCOUNT_ID },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(refreshSessionRequestSchema.safeParse(body).success).toBe(false);
  });
});
