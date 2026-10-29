import { BaseConfigSchema } from './base-config.schema.js';
import { parseConfig } from './parse-config.js';

describe('parseConfig', () => {
  it('applies defaults and splits CORS origins', () => {
    const config = parseConfig(BaseConfigSchema, { CORS_ORIGINS: 'http://a.test, http://b.test' });

    expect(config.NODE_ENV).toBe('development');
    expect(config.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('reports invalid fields without echoing their values', () => {
    expect(() => parseConfig(BaseConfigSchema, { PORT: 'secret-not-a-port' })).toThrow(
      /Invalid configuration: PORT/,
    );
    expect(() => parseConfig(BaseConfigSchema, { PORT: 'secret-not-a-port' })).not.toThrow(
      /secret-not-a-port/,
    );
  });
});
