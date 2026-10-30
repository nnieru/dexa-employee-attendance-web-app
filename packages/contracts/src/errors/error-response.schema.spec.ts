import { errorResponseSchema } from './error-response.schema.js';

describe('errorResponseSchema', () => {
  const validResponse = {
    statusCode: 400,
    code: 'VALIDATION_FAILED',
    message: 'Request is invalid',
  };

  it('should parse the response when statusCode, code and message are present', () => {
    expect(errorResponseSchema.parse(validResponse)).toEqual(validResponse);
  });

  it('should keep the details object when the response carries details', () => {
    const response = {
      statusCode: 503,
      code: 'EMPLOYEE_PROVISIONING_INCOMPLETE',
      message: 'Provisioning is incomplete.',
      details: { operationId: '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f', savedPhase: 'RESERVED' },
    };

    expect(errorResponseSchema.parse(response)).toEqual(response);
  });

  it('should omit the details key when the response has no details', () => {
    expect(errorResponseSchema.parse(validResponse)).not.toHaveProperty('details');
  });

  it('should accept the response when code is not listed in ErrorCode', () => {
    const newerServerResponse = { statusCode: 409, code: 'SOME_NEWER_CODE', message: 'Conflict' };

    expect(errorResponseSchema.safeParse(newerServerResponse).success).toBe(true);
  });

  it.each([
    {
      condition: 'code is missing',
      response: { statusCode: 400, message: 'Request is invalid' },
    },
    { condition: 'code is empty', response: { ...validResponse, code: '' } },
    {
      condition: 'statusCode is not an integer',
      response: { ...validResponse, statusCode: 400.5 },
    },
    {
      condition: 'message is missing',
      response: { statusCode: 400, code: 'VALIDATION_FAILED' },
    },
    {
      condition: 'details is not an object',
      response: { ...validResponse, details: 'operation 1' },
    },
    {
      condition: 'details is an array',
      response: { ...validResponse, details: ['operation 1'] },
    },
  ])('should reject the response when $condition', ({ response }) => {
    expect(errorResponseSchema.safeParse(response).success).toBe(false);
  });
});
