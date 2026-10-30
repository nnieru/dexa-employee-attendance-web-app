import { ValidationError } from '@dexa/common';
import { ErrorCode, loginRequestSchema, type LoginRequest } from '@dexa/contracts';
import type { z } from 'zod';

/** Parses the sign-in body. Failures name the fields only; zod's messages never echo the values sent. */
export function readLoginRequest(body: unknown): LoginRequest {
  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(ErrorCode.VALIDATION_FAILED, describeIssues(parsed.error));
  }
  return parsed.data;
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
    .join('; ');
}
