import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { INVALID_RESPONSE_MESSAGE, InvalidResponseError, parseResponse } from './parse-response.js';

const employeeSummarySchema = z.object({
  accountId: z.string(),
  pageSize: z.number().int(),
});

describe('parseResponse', () => {
  it('should return the parsed data when the response matches the schema', () => {
    const data = { accountId: 'account-1', pageSize: 20 };

    expect(parseResponse(employeeSummarySchema, data)).toEqual(data);
  });

  it('should throw InvalidResponseError with a fixed message when the response does not match the schema', () => {
    const data = { accountId: 'account-secret-value', pageSize: 'not-a-number' };

    let thrown: unknown;
    try {
      parseResponse(employeeSummarySchema, data);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidResponseError);
    expect(thrown).toMatchObject({ message: INVALID_RESPONSE_MESSAGE });
    expect(JSON.stringify(thrown)).not.toContain('account-secret-value');
  });

  it('should throw InvalidResponseError when the response is not an object', () => {
    expect(() => parseResponse(employeeSummarySchema, 'plain text')).toThrow(InvalidResponseError);
  });
});
