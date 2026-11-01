import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';

export const DUPLICATE_EMAIL_FIELD_MESSAGE = 'This company email is already in use.';

// The server has no error code for a duplicate email; it answers CONFLICT with this message (auth-service
// AccountProvisioningService). The message is matched exactly, so any other 409 stays a general alert.
const SERVER_DUPLICATE_EMAIL_MESSAGE = 'An account already uses this company email.';

const EMPLOYEE_CREATED_MESSAGE_SUFFIX = 'was added.';

/** True when the server refused the email because another account already uses it. */
export function isDuplicateEmailConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === ErrorCode.CONFLICT &&
    error.message === SERVER_DUPLICATE_EMAIL_MESSAGE
  );
}

/** The message for a failed create that is not shown on a field. ApiError messages are user-safe by design. */
export function getCreateEmployeeErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_ERROR_MESSAGE;
}

export function getEmployeeCreatedMessage(employeeName: string): string {
  return `${employeeName} ${EMPLOYEE_CREATED_MESSAGE_SUFFIX}`;
}
