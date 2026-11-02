import { useState } from 'react';
import type { CorrectionRequest } from '@dexa/contracts';
import { PageShell } from '@dexa/ui';
import { getCurrentBusinessDate } from '../utils/current-business-date.js';
import type { BusinessDate } from '../utils/business-time.js';
import {
  CORRECTION_REQUEST_PAGE_DESCRIPTION,
  CORRECTION_REQUEST_PAGE_TITLE,
} from '../utils/requests-messages.js';
import { CorrectionRequestForm } from './correction-request-form.js';
import { CurrentRecordPanel } from './current-record-panel.js';

type CorrectionRequestPageProps = {
  /** The date the URL pre-fills (already checked against the window by the route). Defaults to today. */
  initialBusinessDate?: BusinessDate;
  onSubmitted: (request: CorrectionRequest) => void;
};

/**
 * The correction request screen. The current record sits beside the form on wide screens and above it on
 * narrow ones. The page keeps the chosen date, so the record panel follows the form's date field.
 */
export function CorrectionRequestPage({
  initialBusinessDate,
  onSubmitted,
}: CorrectionRequestPageProps) {
  const [today] = useState(getCurrentBusinessDate);
  const [businessDate, setBusinessDate] = useState<BusinessDate>(initialBusinessDate ?? today);

  return (
    <PageShell
      as="div"
      title={CORRECTION_REQUEST_PAGE_TITLE}
      description={CORRECTION_REQUEST_PAGE_DESCRIPTION}
    >
      <div className="correction-request-layout">
        <CurrentRecordPanel businessDate={businessDate} today={today} />
        <CorrectionRequestForm
          today={today}
          initialBusinessDate={businessDate}
          onBusinessDateChange={setBusinessDate}
          onSubmitted={onSubmitted}
        />
      </div>
    </PageShell>
  );
}
