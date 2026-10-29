import { Buffer } from 'node:buffer';
import { readServiceTokenKid } from './read-service-token-kid.js';
import { ServiceName } from './service-name.js';

const PAYLOAD_SEGMENT = 'e30';
const SIGNATURE_SEGMENT = 'signature';

function tokenWithHeader(header: object): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  return `${encodedHeader}.${PAYLOAD_SEGMENT}.${SIGNATURE_SEGMENT}`;
}

describe('readServiceTokenKid', () => {
  it.each([
    {
      condition: 'the header names a known service',
      token: tokenWithHeader({ alg: 'ES256', kid: ServiceName.API_GATEWAY }),
      expected: ServiceName.API_GATEWAY,
    },
    {
      condition: 'the header has no kid',
      token: tokenWithHeader({ alg: 'ES256' }),
      expected: undefined,
    },
    {
      condition: 'the kid is not a known service',
      token: tokenWithHeader({ alg: 'ES256', kid: 'billing-service' }),
      expected: undefined,
    },
    {
      condition: 'the kid is not a string',
      token: tokenWithHeader({ alg: 'ES256', kid: 42 }),
      expected: undefined,
    },
    {
      condition: 'the header is not JSON',
      token: `${Buffer.from('not json').toString('base64url')}.${PAYLOAD_SEGMENT}.${SIGNATURE_SEGMENT}`,
      expected: undefined,
    },
    {
      condition: 'the token is empty',
      token: '',
      expected: undefined,
    },
  ])('should return $expected when $condition', ({ token, expected }) => {
    expect(readServiceTokenKid(token)).toBe(expected);
  });

  it.each([null, undefined, 42])(
    'should return undefined when the token is %p, which is not a string',
    (token) => {
      expect(readServiceTokenKid(token)).toBeUndefined();
    },
  );
});
