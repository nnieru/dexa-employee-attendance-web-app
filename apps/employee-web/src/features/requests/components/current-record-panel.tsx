import { useId } from 'react';
import type { AttendanceSummaryItem } from '@dexa/contracts';
import { Alert, Button, StatusLabel } from '@dexa/ui';
import { useOwnDayAttendance } from '../hooks/use-own-day-attendance.js';
import { formatBusinessClockTime, type BusinessDate } from '../utils/business-time.js';
import { isSelectableCorrectionDate } from '../utils/correction-date-window.js';
import {
  CHECK_IN_LABEL,
  CHECK_OUT_LABEL,
  DAY_STATUS_LABEL,
  type CurrentRecordLabel,
} from '../utils/current-record-labels.js';
import { formatApprovedOvertime } from '../utils/format-approved-overtime.js';
import { getCurrentRecordView, type CurrentRecordView } from '../utils/get-current-record-view.js';
import {
  CURRENT_RECORD_CHOOSE_DATE_MESSAGE,
  CURRENT_RECORD_CLOCK_IN_LABEL,
  CURRENT_RECORD_CLOCK_OUT_LABEL,
  CURRENT_RECORD_DAY_STATUS_LABEL,
  CURRENT_RECORD_EMPTY_MESSAGE,
  CURRENT_RECORD_HEADING_PREFIX,
  CURRENT_RECORD_LOADING_MESSAGE,
  CURRENT_RECORD_LOAD_ERROR_MESSAGE,
  CURRENT_RECORD_NOT_RECORDED_TEXT,
  CURRENT_RECORD_OVERTIME_LABEL,
  CURRENT_RECORD_TRY_AGAIN_LABEL,
} from '../utils/requests-messages.js';

type CurrentRecordPanelProps = {
  businessDate: BusinessDate;
  today: BusinessDate;
};

/**
 * The employee's current values for the chosen date, read-only (COR-4: the record changes only after HR approves). A
 * failure here never blocks the form, because the employee can still ask for a correction without seeing the record.
 */
export function CurrentRecordPanel({ businessDate, today }: CurrentRecordPanelProps) {
  const headingId = useId();
  const isDateSelectable = isSelectableCorrectionDate(businessDate, today);
  const query = useOwnDayAttendance(businessDate, isDateSelectable);
  const view = getCurrentRecordView({
    isDateSelectable,
    isPending: query.isPending,
    isPlaceholderData: query.isPlaceholderData,
    isError: query.isError,
    record: query.data,
  });
  const heading = isDateSelectable
    ? `${CURRENT_RECORD_HEADING_PREFIX} ${businessDate}`
    : CURRENT_RECORD_HEADING_PREFIX;

  return (
    <section className="correction-current-record" aria-labelledby={headingId}>
      <h2 id={headingId} className="correction-current-record__heading">
        {heading}
      </h2>
      <CurrentRecordBody
        view={view}
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    </section>
  );
}

type CurrentRecordBodyProps = {
  view: CurrentRecordView;
  isRetrying: boolean;
  onRetry: () => void;
};

function CurrentRecordBody({ view, isRetrying, onRetry }: CurrentRecordBodyProps) {
  if (view.kind === 'choose-date') {
    return <p className="correction-current-record__text">{CURRENT_RECORD_CHOOSE_DATE_MESSAGE}</p>;
  }
  if (view.kind === 'loading') {
    return (
      <p className="correction-current-record__text" role="status" aria-busy="true">
        {CURRENT_RECORD_LOADING_MESSAGE}
      </p>
    );
  }
  if (view.kind === 'error') {
    return (
      <Alert
        variant="error"
        action={
          <Button variant="secondary" isLoading={isRetrying} onClick={onRetry}>
            {CURRENT_RECORD_TRY_AGAIN_LABEL}
          </Button>
        }
      >
        {CURRENT_RECORD_LOAD_ERROR_MESSAGE}
      </Alert>
    );
  }
  if (view.kind === 'empty') {
    return <p className="correction-current-record__text">{CURRENT_RECORD_EMPTY_MESSAGE}</p>;
  }
  return <RecordDetails record={view.record} />;
}

function RecordDetails({ record }: { record: AttendanceSummaryItem }) {
  return (
    <dl className="correction-current-record__details">
      <CurrentRecordRow
        term={CURRENT_RECORD_CLOCK_IN_LABEL}
        instant={record.clockInAt}
        label={CHECK_IN_LABEL[record.clockInStatus]}
      />
      <CurrentRecordRow
        term={CURRENT_RECORD_CLOCK_OUT_LABEL}
        instant={record.clockOutAt}
        label={CHECK_OUT_LABEL[record.clockOutStatus]}
      />
      <div className="correction-current-record__row">
        <dt>{CURRENT_RECORD_DAY_STATUS_LABEL}</dt>
        <dd>
          <StatusLabel tone={DAY_STATUS_LABEL[record.dayStatus].tone}>
            {DAY_STATUS_LABEL[record.dayStatus].text}
          </StatusLabel>
        </dd>
      </div>
      {record.approvedOvertimeMinutes > 0 && (
        <div className="correction-current-record__row">
          <dt>{CURRENT_RECORD_OVERTIME_LABEL}</dt>
          <dd>{formatApprovedOvertime(record.approvedOvertimeMinutes)}</dd>
        </div>
      )}
    </dl>
  );
}

type CurrentRecordRowProps = {
  term: string;
  instant: string | null;
  label: CurrentRecordLabel;
};

// The time is shown in WIB, and its classification follows it. A missing time has no classification to show.
function CurrentRecordRow({ term, instant, label }: CurrentRecordRowProps) {
  return (
    <div className="correction-current-record__row">
      <dt>{term}</dt>
      <dd>
        <span>
          {instant === null ? CURRENT_RECORD_NOT_RECORDED_TEXT : formatBusinessClockTime(instant)}
        </span>
        {instant !== null && <StatusLabel tone={label.tone}>{label.text}</StatusLabel>}
      </dd>
    </div>
  );
}
