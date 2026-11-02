import { PageShell } from '@dexa/ui';
import type { OvertimeRequest } from '@dexa/contracts';
import {
  OVERTIME_REQUEST_PAGE_DESCRIPTION,
  OVERTIME_REQUEST_PAGE_TITLE,
} from '../utils/requests-messages.js';
import { OvertimeRequestForm } from './overtime-request-form.js';

type OvertimeRequestPageProps = {
  onSubmitted: (request: OvertimeRequest) => void;
};

/** The overtime request screen. The route decides where a submission leads; this page only frames the form. */
export function OvertimeRequestPage({ onSubmitted }: OvertimeRequestPageProps) {
  return (
    <PageShell
      as="div"
      title={OVERTIME_REQUEST_PAGE_TITLE}
      description={OVERTIME_REQUEST_PAGE_DESCRIPTION}
    >
      <OvertimeRequestForm onSubmitted={onSubmitted} />
    </PageShell>
  );
}
