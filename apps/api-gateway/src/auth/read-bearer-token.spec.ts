import { UnauthorizedError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import { readBearerToken } from './read-bearer-token.js';

const TOKEN = 'header.payload.signature';

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('Expected the call to throw.');
}

describe('readBearerToken', () => {
  it.each([
    { condition: 'the scheme is Bearer', header: `Bearer ${TOKEN}` },
    { condition: 'the scheme is lowercase', header: `bearer ${TOKEN}` },
  ])('should return the token when $condition', ({ header }) => {
    expect(readBearerToken(header)).toBe(TOKEN);
  });

  it.each([
    { condition: 'the header is missing', header: undefined },
    { condition: 'the scheme is not Bearer', header: `Basic ${TOKEN}` },
    { condition: 'the token is empty', header: 'Bearer ' },
    { condition: 'the token contains a space', header: `Bearer ${TOKEN} extra` },
  ])('should refuse the request with UNAUTHORIZED when $condition', ({ header }) => {
    const error = captureError(() => readBearerToken(header));

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toMatchObject({ code: ErrorCode.UNAUTHORIZED });
  });
});
