import { useId } from 'react';
import type { EmployeeListItem } from '@dexa/contracts';
import {
  ALL_EMPLOYEES_OPTION_LABEL,
  EMPLOYEE_FILTER_LABEL,
  SELECTED_EMPLOYEE_OPTION_LABEL,
} from '../utils/attendance-monitoring-messages.js';

type EmployeeFilterSelectProps = {
  /** The account ID in the URL. An empty value means every employee. */
  value: string;
  employees: ReadonlyArray<EmployeeListItem>;
  disabled: boolean;
  hint?: string;
  /** Receives the chosen account ID, or an empty string for every employee. */
  onChange: (employeeId: string) => void;
};

/**
 * A native select with a visible label and a linked hint. When the URL names an employee outside the
 * listed page, that employee still gets an option, so the select never shows "All employees" for a filtered list.
 */
export function EmployeeFilterSelect({
  value,
  employees,
  disabled,
  hint,
  onChange,
}: EmployeeFilterSelectProps) {
  const generatedId = useId();
  const selectId = `${generatedId}-employee`;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const isSelectedEmployeeListed =
    value === '' || employees.some((employee) => employee.accountId === value);

  return (
    <div className="dexa-field attendance-employee-filter">
      <label className="dexa-field__label" htmlFor={selectId}>
        {EMPLOYEE_FILTER_LABEL}
      </label>
      <select
        id={selectId}
        className="dexa-field__input"
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{ALL_EMPLOYEES_OPTION_LABEL}</option>
        {isSelectedEmployeeListed ? null : (
          <option value={value}>{SELECTED_EMPLOYEE_OPTION_LABEL}</option>
        )}
        {employees.map((employee) => (
          <option key={employee.accountId} value={employee.accountId}>
            {employee.name}
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className="dexa-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
