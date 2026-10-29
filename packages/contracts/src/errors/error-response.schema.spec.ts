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
  ])('should reject the response when $condition', ({ response }) => {
    expect(errorResponseSchema.safeParse(response).success).toBe(false);
  });
});
