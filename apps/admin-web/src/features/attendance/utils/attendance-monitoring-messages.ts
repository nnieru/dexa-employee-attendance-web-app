import { MAX_PAGE_SIZE } from '@dexa/contracts';
import type { DataTableStatus } from '@dexa/ui';
import type { AttendanceRange } from './attendance-range.js';

export const ATTENDANCE_PAGE_TITLE = 'Attendance';
export const ATTENDANCE_PAGE_DESCRIPTION =
  'Clock-in and clock-out records of all employees, read only. Times are shown in WIB.';
export const ATTENDANCE_TABLE_CAPTION = 'Attendance by employee and day';
export const ATTENDANCE_LOAD_ERROR_MESSAGE = 'Attendance could not be loaded. Try again.';
export const INVALID_RANGE_TABLE_MESSAGE = 'Choose a valid date range to see attendance.';
export const EMPLOYEE_FILTER_LABEL = 'Employee';
export const ALL_EMPLOYEES_OPTION_LABEL = 'All employees';
export const SELECTED_EMPLOYEE_OPTION_LABEL = 'Selected employee';
export const EMPLOYEE_OPTIONS_LOADING_HINT = 'Loading employees.';
export const EMPLOYEE_OPTIONS_ERROR_MESSAGE = 'Employees could not be loaded. Try again.';
export const NOT_AVAILABLE_TEXT = 'Not available';

/** Names the range, so HR can tell an empty result from a filter that is too narrow (DESIGN §9). */
export function getAttendanceEmptyMessage({
  range,
  isFilteredByEmployee,
}: {
  range: AttendanceRange;
  isFilteredByEmployee: boolean;
}): string {
  const employeePhrase = isFilteredByEmployee ? ' for this employee' : '';
  return `No attendance was recorded${employeePhrase} from ${range.from} to ${range.to}.`;
}

/**
 * The employee filter lists one page of the employee list, the largest page the API allows. Saying so keeps HR from
 * reading a short list as the whole company.
 */
export function getEmployeeFilterHint({
  isPending,
  totalItems,
  listedCount,
}: {
  isPending: boolean;
  totalItems: number;
  listedCount: number;
}): string | undefined {
  if (isPending) return EMPLOYEE_OPTIONS_LOADING_HINT;
  if (totalItems > listedCount) {
    return `Only the first ${MAX_PAGE_SIZE} employees are listed.`;
  }
  return undefined;
}

/** Maps the query state to the table state. An error wins over stale rows, so a failed reload is never hidden. */
export function getAttendanceTableStatus({
  isError,
  isFetching,
  isPending,
  onRetry,
}: {
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  onRetry: () => void;
}): DataTableStatus {
  if (isError) return { kind: 'error', message: ATTENDANCE_LOAD_ERROR_MESSAGE, onRetry };
  if (isPending) return { kind: 'loading' };
  if (isFetching) return { kind: 'refreshing' };
  return { kind: 'ready' };
}
