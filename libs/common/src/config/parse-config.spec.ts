import { BaseConfigSchema } from './base-config.schema.js';
import { parseConfig } from './parse-config.js';

describe('parseConfig', () => {
  it('applies defaults and splits CORS origins', () => {
    const config = parseConfig(BaseConfigSchema, {
      BUSINESS_TIMEZONE: 'Asia/Jakarta',
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('reports invalid fields without echoing their values', () => {
    const source = { BUSINESS_TIMEZONE: 'Asia/Jakarta', PORT: 'secret-not-a-port' };

    expect(() => parseConfig(BaseConfigSchema, source)).toThrow(/Invalid configuration: PORT/);
    expect(() => parseConfig(BaseConfigSchema, source)).not.toThrow(/secret-not-a-port/);
  });
});
