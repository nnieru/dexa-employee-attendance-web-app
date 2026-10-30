import { parseConfig, ServiceName } from '@dexa/common';
import { authEnvironmentFor, generateAuthKeySet } from '../../test/auth-key-set.js';
import { ApiGatewayConfigSchema } from './api-gateway-config.schema.js';

const AUTH_SERVICE_URL = 'http://auth-service:3000';
const EMPLOYEE_SERVICE_URL = 'http://employee-service:3000';
const URL_PROTOCOL_MESSAGE =
  'Invalid configuration: AUTH_SERVICE_INTERNAL_URL: must be an http or https URL';
const URL_CREDENTIALS_MESSAGE =
  'Invalid configuration: AUTH_SERVICE_INTERNAL_URL: must not contain credentials';
const EMPLOYEE_URL_PROTOCOL_MESSAGE =
  'Invalid configuration: EMPLOYEE_SERVICE_INTERNAL_URL: must be an http or https URL';
const EMPLOYEE_URL_CREDENTIALS_MESSAGE =
  'Invalid configuration: EMPLOYEE_SERVICE_INTERNAL_URL: must not contain credentials';

// Generated once for the file. The config only needs well-formed keys, which the environment supplies.
const TEST_KEYS = generateAuthKeySet();
const BASE_SOURCE = {
  BUSINESS_TIMEZONE: 'Asia/Jakarta',
  ...authEnvironmentFor(TEST_KEYS, ServiceName.API_GATEWAY),
  AUTH_SERVICE_INTERNAL_URL: AUTH_SERVICE_URL,
  EMPLOYEE_SERVICE_INTERNAL_URL: EMPLOYEE_SERVICE_URL,
};

describe('ApiGatewayConfigSchema', () => {
  it('should return the auth-service base URL when it names a single-label host', () => {
    const config = parseConfig(ApiGatewayConfigSchema, BASE_SOURCE);

    expect(config.AUTH_SERVICE_INTERNAL_URL).toBe(AUTH_SERVICE_URL);
  });

  it.each([
    {
      condition: 'the scheme is not http or https',
      url: 'ftp://auth-service:21',
      message: URL_PROTOCOL_MESSAGE,
    },
    { condition: 'the URL is not a URL', url: 'auth-service', message: URL_PROTOCOL_MESSAGE },
  ])('should reject the config when $condition', ({ url, message }) => {
    expect(() =>
      parseConfig(ApiGatewayConfigSchema, { ...BASE_SOURCE, AUTH_SERVICE_INTERNAL_URL: url }),
    ).toThrow(new Error(message));
  });

  it('should reject the config without echoing the password when the URL carries credentials', () => {
    const credentialedUrl = 'http://gateway:hunter2-secret@auth-service:3000';

    expect(() =>
      parseConfig(ApiGatewayConfigSchema, {
        ...BASE_SOURCE,
        AUTH_SERVICE_INTERNAL_URL: credentialedUrl,
      }),
    ).toThrow(new Error(URL_CREDENTIALS_MESSAGE));
  });

  it('should reject the config when AUTH_SERVICE_INTERNAL_URL is unset', () => {
    expect(() =>
      parseConfig(ApiGatewayConfigSchema, { ...BASE_SOURCE, AUTH_SERVICE_INTERNAL_URL: undefined }),
    ).toThrow(/AUTH_SERVICE_INTERNAL_URL: must be an http or https URL/);
  });

  it('should return the employee-service base URL when it names a single-label host', () => {
    const config = parseConfig(ApiGatewayConfigSchema, BASE_SOURCE);

    expect(config.EMPLOYEE_SERVICE_INTERNAL_URL).toBe(EMPLOYEE_SERVICE_URL);
  });

  it.each([
    {
      condition: 'the scheme is not http or https',
      url: 'ftp://employee-service:21',
      message: EMPLOYEE_URL_PROTOCOL_MESSAGE,
    },
    {
      condition: 'the URL is not a URL',
      url: 'employee-service',
      message: EMPLOYEE_URL_PROTOCOL_MESSAGE,
    },
    {
      condition: 'the URL carries credentials',
      url: 'http://gateway:hunter2-secret@employee-service:3000',
      message: EMPLOYEE_URL_CREDENTIALS_MESSAGE,
    },
  ])('should reject the config when $condition', ({ url, message }) => {
    // The exact message also proves that a URL with credentials is never echoed into the error.
    expect(() =>
      parseConfig(ApiGatewayConfigSchema, { ...BASE_SOURCE, EMPLOYEE_SERVICE_INTERNAL_URL: url }),
    ).toThrow(new Error(message));
  });

  it('should reject the config when SERVICE_NAME is not api-gateway', () => {
    // The key check also fails for another name, so the message is matched by its field part.
    expect(() =>
      parseConfig(ApiGatewayConfigSchema, {
        ...BASE_SOURCE,
        SERVICE_NAME: ServiceName.AUTH_SERVICE,
      }),
    ).toThrow(/Invalid configuration: SERVICE_NAME: must be api-gateway/);
  });
});
