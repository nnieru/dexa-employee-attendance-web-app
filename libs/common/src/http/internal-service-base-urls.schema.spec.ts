import { ServiceName } from '../auth/service-name.js';
import { InternalServiceBaseUrlsSchema } from './internal-service-base-urls.schema.js';

describe('InternalServiceBaseUrlsSchema', () => {
  it.each([
    { condition: 'the host is a single-label name', baseUrl: 'http://employee-service:3000' },
    { condition: 'the host is an IPv4 literal with a path', baseUrl: 'http://127.0.0.1:3001/' },
    { condition: 'the host is an IPv6 literal', baseUrl: 'http://[::1]:3000' },
    { condition: 'the scheme is https', baseUrl: 'https://auth.internal.example' },
  ])('should accept the map when $condition', ({ baseUrl }) => {
    const result = InternalServiceBaseUrlsSchema.safeParse({ [ServiceName.AUTH_SERVICE]: baseUrl });

    expect(result.success).toBe(true);
  });

  it.each([
    { condition: 'the scheme is ftp', baseUrl: 'ftp://auth-service:21' },
    { condition: 'the scheme is javascript', baseUrl: 'javascript:alert(1)' },
    { condition: 'the value is not a URL', baseUrl: 'not a url' },
    { condition: 'the value is empty', baseUrl: '' },
  ])('should reject the map when $condition', ({ baseUrl }) => {
    const result = InternalServiceBaseUrlsSchema.safeParse({ [ServiceName.AUTH_SERVICE]: baseUrl });

    expect(result.success).toBe(false);
  });

  it.each([
    { condition: 'the URL has a user name', baseUrl: 'http://user@auth-service:3000' },
    {
      condition: 'the URL has a user name and a password',
      baseUrl: 'https://user:secret@auth-service',
    },
    {
      condition: 'the URL has an empty user name and a password',
      baseUrl: 'http://:secret@auth-service',
    },
  ])('should reject the map when $condition', ({ baseUrl }) => {
    const result = InternalServiceBaseUrlsSchema.safeParse({ [ServiceName.AUTH_SERVICE]: baseUrl });

    expect(result.success).toBe(false);
  });

  it('should report that credentials are not allowed without echoing them when the URL has a password', () => {
    const result = InternalServiceBaseUrlsSchema.safeParse({
      [ServiceName.AUTH_SERVICE]: 'http://user:secret@auth-service:3000',
    });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'must not contain credentials',
    ]);
    expect(JSON.stringify(result.error?.issues)).not.toContain('secret');
  });

  it('should reject the map when a key is not a known service name', () => {
    const result = InternalServiceBaseUrlsSchema.safeParse({
      'billing-service': 'http://billing-service:3000',
    });

    expect(result.success).toBe(false);
  });

  it('should accept an empty map when the service calls no other service', () => {
    expect(InternalServiceBaseUrlsSchema.safeParse({}).success).toBe(true);
  });
});
