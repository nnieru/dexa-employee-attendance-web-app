import { BaseConfigSchema } from './base-config.schema.js';
import { parseConfig } from './parse-config.js';

describe('BaseConfigSchema BUSINESS_TIMEZONE', () => {
  it.each(['Asia/Jakarta', 'UTC'])('should accept %p when it is an IANA zone name', (timeZone) => {
    const config = parseConfig(BaseConfigSchema, { BUSINESS_TIMEZONE: timeZone });

    expect(config.BUSINESS_TIMEZONE).toBe(timeZone);
  });

  it.each(['WIB', 'GMT+7', '+07:00', 'Asia/Atlantis', ''])(
    'should reject %p when it is not an IANA zone name',
    (timeZone) => {
      expect(() => parseConfig(BaseConfigSchema, { BUSINESS_TIMEZONE: timeZone })).toThrow(
        /Invalid configuration: BUSINESS_TIMEZONE: must be an IANA time zone/,
      );
    },
  );

  it('should reject the config when BUSINESS_TIMEZONE is missing', () => {
    expect(() => parseConfig(BaseConfigSchema, {})).toThrow(
      /Invalid configuration: BUSINESS_TIMEZONE: /,
    );
  });
});
