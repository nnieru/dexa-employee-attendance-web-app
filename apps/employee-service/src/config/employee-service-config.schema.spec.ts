import { parseConfig } from '@dexa/common';
import { employeeServiceEnvironment } from '../../test/employee-service-environment.js';
import { EmployeeServiceConfigSchema } from './employee-service-config.schema.js';
import { FIXTURE_MASTER_DATA } from './master-data-fixtures.js';

const DATABASE_URL = 'postgres://employee_app:test-only-password@postgres:5432/employee_db';
const PROTOCOL_MESSAGE = 'must be a postgres:// connection URL';
const TARGET_MESSAGE = 'must name a host and a database';
const FIXTURES = 'fixtures';
// Production requires the bootstrap HR settings (see the EMPLOYEE_BOOTSTRAP_HR_* block below), so the helpers that
// start a production config supply valid ones. Those tests then fail only on the setting they name.
const BOOTSTRAP_HR_SETTINGS = {
  EMPLOYEE_BOOTSTRAP_HR_EMAIL: 'hr.admin@dexa.test',
  EMPLOYEE_BOOTSTRAP_HR_NAME: 'Sari Lestari',
  EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: 'HR_OFFICER',
};

const VALID_DOCUMENT = {
  positions: [{ code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' }],
  employeeStatuses: [
    { code: 'ACTIVE', name: 'Active' },
    { code: 'INACTIVE', name: 'Inactive' },
  ],
};

function parseMasterData(setting: string | undefined, nodeEnvironment = 'test'): unknown {
  return parseConfig(
    EmployeeServiceConfigSchema,
    employeeServiceEnvironment({
      NODE_ENV: nodeEnvironment,
      EMPLOYEE_MASTER_DATA: setting,
      ...BOOTSTRAP_HR_SETTINGS,
    }),
  ).EMPLOYEE_MASTER_DATA;
}

function masterDataError(setting: string, nodeEnvironment = 'test'): string {
  try {
    parseMasterData(setting, nodeEnvironment);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected the master data setting to be rejected, but it was accepted.');
}

describe('EmployeeServiceConfigSchema EMPLOYEE_DATABASE_URL', () => {
  it.each([
    'postgres://employee_app:test-only-password@postgres:5432/employee_db',
    'postgresql://employee_app:test-only-password@127.0.0.1:5432/employee_db',
  ])('should accept %s when it names a host and a database', (databaseUrl) => {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({ EMPLOYEE_DATABASE_URL: databaseUrl }),
    );

    expect(config.EMPLOYEE_DATABASE_URL).toBe(databaseUrl);
  });

  it.each([
    { condition: 'the variable is unset', databaseUrl: undefined, message: PROTOCOL_MESSAGE },
    {
      condition: 'the scheme is not postgres',
      databaseUrl: 'http://employee_app:test-only-password@postgres/employee_db',
      message: PROTOCOL_MESSAGE,
    },
    {
      condition: 'the database name is missing',
      databaseUrl: 'postgres://employee_app:test-only-password@postgres:5432/',
      message: TARGET_MESSAGE,
    },
  ])('should reject the config when $condition', ({ databaseUrl, message }) => {
    // The exact message proves that only the field name is reported, never the URL or its password.
    expect(() =>
      parseConfig(
        EmployeeServiceConfigSchema,
        employeeServiceEnvironment({ EMPLOYEE_DATABASE_URL: databaseUrl }),
      ),
    ).toThrow(new Error(`Invalid configuration: EMPLOYEE_DATABASE_URL: ${message}`));
  });

  it('should keep the database URL out of the rejection message', () => {
    const message = (() => {
      try {
        parseConfig(
          EmployeeServiceConfigSchema,
          employeeServiceEnvironment({ EMPLOYEE_DATABASE_URL: `http://x:${DATABASE_URL}` }),
        );
      } catch (error) {
        return error instanceof Error ? error.message : '';
      }
      return '';
    })();

    expect(message).not.toContain('test-only-password');
  });
});

describe('EmployeeServiceConfigSchema AUTH_SERVICE_INTERNAL_URL', () => {
  it('should return the auth-service base URL when it names a single-label host', () => {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({ AUTH_SERVICE_INTERNAL_URL: 'http://auth-service:3000' }),
    );

    expect(config.AUTH_SERVICE_INTERNAL_URL).toBe('http://auth-service:3000');
  });

  it.each([
    {
      condition: 'the variable is unset',
      url: undefined,
      message: 'must be an http or https URL',
    },
    {
      condition: 'the scheme is not http or https',
      url: 'ftp://auth-service:21',
      message: 'must be an http or https URL',
    },
    {
      condition: 'the URL carries credentials',
      url: 'http://employee:hunter2-secret@auth-service:3000',
      message: 'must not contain credentials',
    },
  ])('should reject the config when $condition', ({ url, message }) => {
    expect(() =>
      parseConfig(
        EmployeeServiceConfigSchema,
        employeeServiceEnvironment({ AUTH_SERVICE_INTERNAL_URL: url }),
      ),
    ).toThrow(new Error(`Invalid configuration: AUTH_SERVICE_INTERNAL_URL: ${message}`));
  });
});

describe('EmployeeServiceConfigSchema EMPLOYEE_MASTER_DATA', () => {
  it.each([
    { condition: 'the variable is unset', setting: undefined },
    { condition: 'the value is empty', setting: '' },
  ])('should seed nothing when $condition', ({ setting }) => {
    expect(parseMasterData(setting)).toBeUndefined();
  });

  it('should select the labeled fixtures when the value is fixtures outside production', () => {
    expect(parseMasterData(FIXTURES, 'development')).toEqual(FIXTURE_MASTER_DATA);
  });

  it('should reject fixtures when NODE_ENV is production', () => {
    expect(masterDataError(FIXTURES, 'production')).toBe(
      'Invalid configuration: EMPLOYEE_MASTER_DATA: fixtures must not be used when NODE_ENV is production',
    );
  });

  it('should return the parsed positions and employee statuses when the value is valid JSON', () => {
    expect(parseMasterData(JSON.stringify(VALID_DOCUMENT))).toEqual(VALID_DOCUMENT);
  });

  it('should accept an empty positions list when the employee statuses are complete', () => {
    const document = { ...VALID_DOCUMENT, positions: [] };

    expect(parseMasterData(JSON.stringify(document))).toEqual(document);
  });

  it('should reject the document when the ACTIVE employee status is missing', () => {
    const document = {
      ...VALID_DOCUMENT,
      employeeStatuses: [{ code: 'INACTIVE', name: 'Inactive' }],
    };

    expect(masterDataError(JSON.stringify(document))).toBe(
      'Invalid configuration: EMPLOYEE_MASTER_DATA.employeeStatuses: must include an entry with code ACTIVE',
    );
  });

  it('should reject the document when the INACTIVE employee status is missing', () => {
    const document = {
      ...VALID_DOCUMENT,
      employeeStatuses: [{ code: 'ACTIVE', name: 'Active' }],
    };

    expect(masterDataError(JSON.stringify(document))).toBe(
      'Invalid configuration: EMPLOYEE_MASTER_DATA.employeeStatuses: must include an entry with code INACTIVE',
    );
  });

  it('should reject the document when a position code appears twice', () => {
    const document = {
      ...VALID_DOCUMENT,
      positions: [
        { code: 'HR_OFFICER', name: 'HR Officer' },
        { code: 'HR_OFFICER', name: 'HR Officer again' },
      ],
    };

    expect(masterDataError(JSON.stringify(document))).toBe(
      'Invalid configuration: EMPLOYEE_MASTER_DATA.positions.1.code: must be unique within its list',
    );
  });

  it.each([
    { code: 'hr-officer', reason: 'lowercase letters' },
    { code: 'HR OFFICER', reason: 'a space' },
    { code: '', reason: 'an empty code' },
  ])('should reject a position code with $reason', ({ code }) => {
    const document = { ...VALID_DOCUMENT, positions: [{ code, name: 'HR Officer' }] };

    expect(masterDataError(JSON.stringify(document))).toMatch(
      /^Invalid configuration: EMPLOYEE_MASTER_DATA\.positions\.0\.code: must use only uppercase letters, digits, and underscores$/,
    );
  });

  it('should reject a code longer than 50 characters', () => {
    const document = {
      ...VALID_DOCUMENT,
      positions: [{ code: 'A'.repeat(51), name: 'Too long' }],
    };

    expect(masterDataError(JSON.stringify(document))).toBe(
      'Invalid configuration: EMPLOYEE_MASTER_DATA.positions.0.code: must be at most 50 characters',
    );
  });

  it('should reject a blank name without echoing it', () => {
    const document = { ...VALID_DOCUMENT, positions: [{ code: 'BLANK', name: '   ' }] };

    expect(masterDataError(JSON.stringify(document))).toBe(
      'Invalid configuration: EMPLOYEE_MASTER_DATA.positions.0.name: must not be blank',
    );
  });

  it('should reject a document with an unknown field', () => {
    const document = { ...VALID_DOCUMENT, roles: [] };

    expect(masterDataError(JSON.stringify(document))).toMatch(
      /^Invalid configuration: EMPLOYEE_MASTER_DATA: Unrecognized key/,
    );
  });

  it('should reject text that is not JSON without echoing the text', () => {
    const notJson = '{"positions": [ secret-token-value';

    const message = masterDataError(notJson);

    expect(message).toBe(
      'Invalid configuration: EMPLOYEE_MASTER_DATA: must be fixtures or a JSON object with positions and employeeStatuses arrays',
    );
    expect(message).not.toContain('secret-token-value');
  });
});

describe('EmployeeServiceConfigSchema EMPLOYEE_PHOTO_DIRECTORY', () => {
  function photoDirectoryError(setting: string | undefined, nodeEnvironment: string): string {
    try {
      parseConfig(
        EmployeeServiceConfigSchema,
        employeeServiceEnvironment({
          NODE_ENV: nodeEnvironment,
          EMPLOYEE_PHOTO_DIRECTORY: setting,
          ...BOOTSTRAP_HR_SETTINGS,
        }),
      );
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('Expected the photo directory setting to be rejected, but it was accepted.');
  }

  it('should return the absolute directory when the value is an absolute path', () => {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({ EMPLOYEE_PHOTO_DIRECTORY: '/var/lib/dexa/employee-photos' }),
    );

    expect(config.EMPLOYEE_PHOTO_DIRECTORY).toBe('/var/lib/dexa/employee-photos');
  });

  it('should fall back to the ignored local work directory when unset outside production', () => {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({ NODE_ENV: 'development', EMPLOYEE_PHOTO_DIRECTORY: undefined }),
    );

    expect(config.EMPLOYEE_PHOTO_DIRECTORY).toMatch(/[\\/]\.data[\\/]photos$/);
    expect(config.EMPLOYEE_PHOTO_DIRECTORY.startsWith('/')).toBe(true);
  });

  it('should reject the config when the directory is unset in production', () => {
    expect(photoDirectoryError(undefined, 'production')).toBe(
      'Invalid configuration: EMPLOYEE_PHOTO_DIRECTORY: must name an absolute directory when NODE_ENV is production',
    );
  });

  it('should reject a relative directory without echoing the value', () => {
    expect(photoDirectoryError('photos/../../etc', 'development')).toBe(
      'Invalid configuration: EMPLOYEE_PHOTO_DIRECTORY: must be an absolute path',
    );
  });
});

describe('EmployeeServiceConfigSchema EMPLOYEE_BOOTSTRAP_HR_*', () => {
  function bootstrapHrError(
    overrides: Record<string, string | undefined>,
    nodeEnvironment = 'test',
  ): string {
    try {
      parseConfig(
        EmployeeServiceConfigSchema,
        employeeServiceEnvironment({ NODE_ENV: nodeEnvironment, ...overrides }),
      );
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('Expected the bootstrap HR settings to be rejected, but they were accepted.');
  }

  it('should return all three values when they are set', () => {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment(BOOTSTRAP_HR_SETTINGS),
    );

    expect(config).toMatchObject(BOOTSTRAP_HR_SETTINGS);
  });

  it('should trim the email and the name when they are surrounded by whitespace', () => {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        ...BOOTSTRAP_HR_SETTINGS,
        EMPLOYEE_BOOTSTRAP_HR_EMAIL: '  hr.admin@dexa.test ',
        EMPLOYEE_BOOTSTRAP_HR_NAME: '  Sari Lestari  ',
      }),
    );

    expect(config.EMPLOYEE_BOOTSTRAP_HR_EMAIL).toBe('hr.admin@dexa.test');
    expect(config.EMPLOYEE_BOOTSTRAP_HR_NAME).toBe('Sari Lestari');
  });

  it('should leave all three values unset when they are none of them set outside production', () => {
    const config = parseConfig(EmployeeServiceConfigSchema, employeeServiceEnvironment());

    expect(config.EMPLOYEE_BOOTSTRAP_HR_EMAIL).toBeUndefined();
    expect(config.EMPLOYEE_BOOTSTRAP_HR_NAME).toBeUndefined();
    expect(config.EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE).toBeUndefined();
  });

  it('should treat blank and whitespace-only values as unset', () => {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        EMPLOYEE_BOOTSTRAP_HR_EMAIL: '',
        EMPLOYEE_BOOTSTRAP_HR_NAME: '   ',
        EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: '',
      }),
    );

    expect(config.EMPLOYEE_BOOTSTRAP_HR_NAME).toBeUndefined();
    expect(config.EMPLOYEE_BOOTSTRAP_HR_EMAIL).toBeUndefined();
  });

  it('should reject a partial set and name each missing field', () => {
    expect(bootstrapHrError({ EMPLOYEE_BOOTSTRAP_HR_EMAIL: 'hr.admin@dexa.test' })).toBe(
      'Invalid configuration: EMPLOYEE_BOOTSTRAP_HR_NAME: must be set when the other EMPLOYEE_BOOTSTRAP_HR settings are set; EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: must be set when the other EMPLOYEE_BOOTSTRAP_HR settings are set',
    );
  });

  it('should require all three fields by name when NODE_ENV is production and none is set', () => {
    expect(
      bootstrapHrError(
        {
          EMPLOYEE_BOOTSTRAP_HR_EMAIL: undefined,
          EMPLOYEE_BOOTSTRAP_HR_NAME: undefined,
          EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: undefined,
        },
        'production',
      ),
    ).toBe(
      'Invalid configuration: EMPLOYEE_BOOTSTRAP_HR_EMAIL: must be set when NODE_ENV is production; EMPLOYEE_BOOTSTRAP_HR_NAME: must be set when NODE_ENV is production; EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: must be set when NODE_ENV is production',
    );
  });

  it('should accept all three values when NODE_ENV is production', () => {
    const config = parseConfig(
      EmployeeServiceConfigSchema,
      employeeServiceEnvironment({
        NODE_ENV: 'production',
        EMPLOYEE_PHOTO_DIRECTORY: '/var/lib/dexa/employee-photos',
        ...BOOTSTRAP_HR_SETTINGS,
      }),
    );

    expect(config.EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE).toBe('HR_OFFICER');
  });

  it('should reject an invalid email without echoing it', () => {
    const message = bootstrapHrError({
      ...BOOTSTRAP_HR_SETTINGS,
      EMPLOYEE_BOOTSTRAP_HR_EMAIL: 'not-an-email-secret',
    });

    expect(message).toBe(
      'Invalid configuration: EMPLOYEE_BOOTSTRAP_HR_EMAIL: must be an email address',
    );
    expect(message).not.toContain('not-an-email-secret');
  });

  it('should reject an email longer than 254 characters', () => {
    const longEmail = `${'a'.repeat(250)}@dexa.test`;

    expect(
      bootstrapHrError({ ...BOOTSTRAP_HR_SETTINGS, EMPLOYEE_BOOTSTRAP_HR_EMAIL: longEmail }),
    ).toBe('Invalid configuration: EMPLOYEE_BOOTSTRAP_HR_EMAIL: must be at most 254 characters');
  });

  it('should reject a name longer than 150 characters without echoing it', () => {
    const message = bootstrapHrError({
      ...BOOTSTRAP_HR_SETTINGS,
      EMPLOYEE_BOOTSTRAP_HR_NAME: 'N'.repeat(151),
    });

    expect(message).toBe(
      'Invalid configuration: EMPLOYEE_BOOTSTRAP_HR_NAME: must be at most 150 characters',
    );
    expect(message).not.toContain('NNNN');
  });

  it.each([
    { code: 'hr-officer', reason: 'lowercase letters' },
    { code: 'HR OFFICER', reason: 'a space' },
  ])('should reject a position code with $reason', ({ code }) => {
    expect(
      bootstrapHrError({ ...BOOTSTRAP_HR_SETTINGS, EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: code }),
    ).toBe(
      'Invalid configuration: EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: must use only uppercase letters, digits, and underscores',
    );
  });
});
