import { ValidationError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Parses a request body with a contracts schema. A failure names the fields only, never the values that
 * were sent, because a body can hold a password.
 */
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: z.ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(ErrorCode.VALIDATION_FAILED, describeIssues(result.error));
    }
    return result.data;
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
    .join('; ');
}
