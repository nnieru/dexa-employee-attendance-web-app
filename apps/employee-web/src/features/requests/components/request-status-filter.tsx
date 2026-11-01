import { requestStatusSchema, type RequestStatus } from '@dexa/contracts';
import { ALL_STATUSES_LABEL, STATUS_FILTER_LABEL } from '../utils/requests-messages.js';
import { getRequestStatusDisplay } from '../utils/get-request-status-display.js';

type RequestStatusFilterProps = {
  status: RequestStatus | undefined;
  onStatusChange: (status: RequestStatus | undefined) => void;
};

const ALL_STATUSES_VALUE = 'ALL';
const STATUS_OPTIONS = requestStatusSchema.options;
const SELECT_ID = 'requests-status-filter';

/** A value that is not a status is treated as All, so the select can never send an unknown filter to the API. */
function toStatusFilter(value: string): RequestStatus | undefined {
  const parsed = requestStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function RequestStatusFilter({ status, onStatusChange }: RequestStatusFilterProps) {
  return (
    <div className="dexa-field requests-status-filter">
      <label className="dexa-field__label" htmlFor={SELECT_ID}>
        {STATUS_FILTER_LABEL}
      </label>
      <select
        id={SELECT_ID}
        className="dexa-field__input"
        value={status ?? ALL_STATUSES_VALUE}
        onChange={(event) => onStatusChange(toStatusFilter(event.target.value))}
      >
        <option value={ALL_STATUSES_VALUE}>{ALL_STATUSES_LABEL}</option>
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {getRequestStatusDisplay(option).text}
          </option>
        ))}
      </select>
    </div>
  );
}
