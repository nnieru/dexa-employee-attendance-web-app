import { parseConfig } from '@dexa/common';
import { employeeServiceEnvironment } from '../../test/employee-service-environment.js';
import { EmployeeServiceConfigSchema } from './employee-service-config.schema.js';
import { FIXTURE_MASTER_DATA } from './master-data-fixtures.js';

const DATABASE_URL = 'postgres://employee_app:test-only-password@postgres:5432/employee_db';
const PROTOCOL_MESSAGE = 'must be a postgres:// connection URL';
const TARGET_MESSAGE = 'must name a host and a database';
const FIXTURES = 'fixtures';

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
    employeeServiceEnvironment({ NODE_ENV: nodeEnvironment, EMPLOYEE_MASTER_DATA: setting }),
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
