import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { EmployeeListItem, EmployeeListPage } from '@dexa/contracts';
import { Alert, Button, DateRangeFilter } from '@dexa/ui';
import { getAttendanceRangeError, type AttendanceRange } from '../utils/attendance-range.js';
import type { BusinessDate } from '../utils/business-date.js';
import {
  EMPLOYEE_OPTIONS_ERROR_MESSAGE,
  getEmployeeFilterHint,
} from '../utils/attendance-monitoring-messages.js';
import { EmployeeFilterSelect } from './employee-filter-select.js';

const RETRY_LABEL = 'Try again';
const NO_EMPLOYEES: ReadonlyArray<EmployeeListItem> = [];

type AttendanceMonitoringFiltersProps = {
  /** The range in the URL. */
  range: AttendanceRange;
  /** Today in the company timezone, which the presets end on. */
  today: BusinessDate;
  employeeId: string | undefined;
  employeeOptions: UseQueryResult<EmployeeListPage, Error>;
  onRangeSearch: (range: AttendanceRange) => void;
  onEmployeeChange: (employeeId: string) => void;
};

/**
 * The range and employee filters. A range is checked before it is searched, so an out-of-order range never reaches
 * the API. The employee choice applies at once and keeps the range in the URL.
 */
export function AttendanceMonitoringFilters({
  range,
  today,
  employeeId,
  employeeOptions,
  onRangeSearch,
  onEmployeeChange,
}: AttendanceMonitoringFiltersProps) {
  // Set only by a rejected Search press. The range in the URL is checked on every render.
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const urlRangeError = getAttendanceRangeError(range);
  const employees = employeeOptions.data?.items ?? NO_EMPLOYEES;

  function handleRangeSearch(draft: AttendanceRange) {
    const draftError = getAttendanceRangeError(draft);
    setSubmitError(draftError);
    if (draftError !== undefined) return;
    onRangeSearch(draft);
  }

  return (
    <>
      <DateRangeFilter
        value={range}
        today={today}
        error={submitError ?? urlRangeError}
        onSearch={handleRangeSearch}
        onReset={() => setSubmitError(undefined)}
      />
      <EmployeeFilterSelect
        value={employeeId ?? ''}
        employees={employees}
        disabled={!employeeOptions.isSuccess}
        hint={getEmployeeFilterHint({
          isPending: employeeOptions.isPending,
          totalItems: employeeOptions.data?.totalItems ?? 0,
          listedCount: employees.length,
        })}
        onChange={onEmployeeChange}
      />
      {employeeOptions.isError && (
        <Alert
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void employeeOptions.refetch()}>
              {RETRY_LABEL}
            </Button>
          }
        >
          {EMPLOYEE_OPTIONS_ERROR_MESSAGE}
        </Alert>
      )}
    </>
  );
}
