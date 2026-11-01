import { useId } from 'react';
import type { RequestStatus } from '@dexa/contracts';
import { getApprovalStatusDisplay } from '../utils/approval-display.js';
import { STATUS_FILTER_LABEL } from '../utils/approval-messages.js';

const STATUSES: ReadonlyArray<RequestStatus> = ['PENDING', 'APPROVED', 'REJECTED'];

type ApprovalStatusFilterProps = {
  status: RequestStatus;
  onStatusChange: (status: RequestStatus) => void;
};

/** The status filter. The queue always has a status, because the list is the work queue by default. */
export function ApprovalStatusFilter({ status, onStatusChange }: ApprovalStatusFilterProps) {
  const selectId = useId();
  return (
    <div className="dexa-field approval-status-filter">
      <label className="dexa-field__label" htmlFor={selectId}>
        {STATUS_FILTER_LABEL}
      </label>
      <select
        id={selectId}
        className="dexa-field__input"
        value={status}
        onChange={(event) => onStatusChange(event.target.value as RequestStatus)}
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {getApprovalStatusDisplay(value).text}
          </option>
        ))}
      </select>
    </div>
  );
}
