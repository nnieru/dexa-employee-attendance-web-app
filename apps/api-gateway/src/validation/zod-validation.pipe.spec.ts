import { ValidationError } from '@dexa/common';
import { ErrorCode, loginRequestSchema, Portal } from '@dexa/contracts';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const PASSWORD_VALUE = 'hunter2-secret';
const EMAIL_VALUE = 'nadia.rahma@dexa.test';

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('Expected the call to throw.');
}

describe('ZodValidationPipe', () => {
  it('should return the parsed value when the body matches the schema', () => {
    const pipe = new ZodValidationPipe(loginRequestSchema);
    const body = { email: EMAIL_VALUE, password: PASSWORD_VALUE, portal: Portal.EMPLOYEE };

    expect(pipe.transform(body)).toEqual(body);
  });

  it('should throw ValidationError that names the failing field when the body does not match', () => {
    const pipe = new ZodValidationPipe(loginRequestSchema);

    const error = captureError(() =>
      pipe.transform({ email: EMAIL_VALUE, password: PASSWORD_VALUE }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(error).toHaveProperty('message', expect.stringContaining('portal:'));
  });

  it('should not echo the submitted values in the message when the body does not match', () => {
    const pipe = new ZodValidationPipe(loginRequestSchema);

    const error = captureError(() =>
      pipe.transform({ email: 'not-an-email', password: PASSWORD_VALUE, portal: 'ADMIN' }),
    );

    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('email:');
    expect(message).not.toContain(PASSWORD_VALUE);
    expect(message).not.toContain('not-an-email');
    expect(message).not.toContain('ADMIN');
  });
});
