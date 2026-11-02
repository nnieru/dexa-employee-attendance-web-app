import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';

// The form fields a server validation message can name (contract updateEmployeeRequestSchema).
const UPDATE_EMPLOYEE_FIELD_NAMES = [
  'name',
  'positionId',
  'employeeStatusId',
  'phoneNumber',
  'newPassword',
] as const;

export type UpdateEmployeeFieldName = (typeof UPDATE_EMPLOYEE_FIELD_NAMES)[number];

const MESSAGE_FIELD_SEPARATOR = ': ';
const MESSAGE_ISSUE_SEPARATOR = '; ';

function isUpdateEmployeeFieldName(name: string): name is UpdateEmployeeFieldName {
  return (UPDATE_EMPLOYEE_FIELD_NAMES as ReadonlyArray<string>).includes(name);
}

/**
 * A validation message names the field first ("positionId: must reference an existing active position."). When that
 * field is on the form, the message is shown beside it. Any other message stays a general alert.
 */
export function getUpdateEmployeeFieldError(
  error: unknown,
): { field: UpdateEmployeeFieldName; message: string } | undefined {
  if (!(error instanceof ApiError) || error.code !== ErrorCode.VALIDATION_FAILED) return undefined;
  const [firstIssue = ''] = error.message.split(MESSAGE_ISSUE_SEPARATOR);
  const separatorIndex = firstIssue.indexOf(MESSAGE_FIELD_SEPARATOR);
  if (separatorIndex < 0) return undefined;
  const field = firstIssue.slice(0, separatorIndex);
  if (!isUpdateEmployeeFieldName(field)) return undefined;
  return { field, message: firstIssue.slice(separatorIndex + MESSAGE_FIELD_SEPARATOR.length) };
}

/** The message for a failed update that is not shown on a field. ApiError messages are user-safe by design. */
export function getUpdateEmployeeErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_ERROR_MESSAGE;
}

/** True when some steps of the update saved and others did not, so the next save must repeat the status. */
export function isPartialUpdateError(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE;
}

export function isEmployeeNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.NOT_FOUND;
}

export function getEmployeeUpdatedMessage(employeeName: string): string {
  return `${employeeName} was updated.`;
}
