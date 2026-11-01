import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { EmployeeListItem, EmployeeListPage, RequestStatus } from '@dexa/contracts';
import { Alert, Button, DateRangeFilter, type DateRange } from '@dexa/ui';
import {
  EMPLOYEE_OPTIONS_ERROR_MESSAGE,
  getEmployeeFilterHint,
} from '../utils/approval-messages.js';
import { ApprovalStatusFilter } from './approval-status-filter.js';
import { EmployeeFilterSelect } from './employee-filter-select.js';

const RETRY_LABEL = 'Try again';
const NO_EMPLOYEES: ReadonlyArray<EmployeeListItem> = [];
const INVALID_DATE_MESSAGE = 'Enter a valid From and To date.';
const RANGE_ORDER_MESSAGE = 'From must not be after To.';

type ApprovalFiltersProps = {
  /** The range in the URL. */
  range: DateRange;
  /** Today in the company timezone, which the presets end on. */
  today: string;
  status: RequestStatus;
  employeeId: string | undefined;
  employeeOptions: UseQueryResult<EmployeeListPage, Error>;
  onRangeSearch: (range: DateRange) => void;
  onStatusChange: (status: RequestStatus) => void;
  onEmployeeChange: (employeeId: string) => void;
};

function getRangeError(range: DateRange): string | undefined {
  if (range.from.length === 0 || range.to.length === 0) return INVALID_DATE_MESSAGE;
  if (range.from > range.to) return RANGE_ORDER_MESSAGE;
  return undefined;
}

/**
 * The status, employee, and date filters. A range is checked before it is searched, so an out-of-order range never
 * reaches the API. The employee and status choices apply at once and keep the range in the URL.
 */
export function ApprovalFilters({
  range,
  today,
  status,
  employeeId,
  employeeOptions,
  onRangeSearch,
  onStatusChange,
  onEmployeeChange,
}: ApprovalFiltersProps) {
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const urlRangeError = getRangeError(range);
  const employees = employeeOptions.data?.items ?? NO_EMPLOYEES;

  function handleRangeSearch(draft: DateRange) {
    const draftError = getRangeError(draft);
    setSubmitError(draftError);
    if (draftError !== undefined) return;
    onRangeSearch(draft);
  }

  return (
    <>
      <div className="approval-filters">
        <ApprovalStatusFilter status={status} onStatusChange={onStatusChange} />
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
      </div>
      <DateRangeFilter
        value={range}
        today={today}
        error={submitError ?? urlRangeError}
        onSearch={handleRangeSearch}
        onReset={() => setSubmitError(undefined)}
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
