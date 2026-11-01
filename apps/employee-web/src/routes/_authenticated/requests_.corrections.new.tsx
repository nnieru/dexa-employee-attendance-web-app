import { createFileRoute } from '@tanstack/react-router';
import { useToast } from '@dexa/ui';
import { CorrectionRequestPage } from '../../features/requests/components/correction-request-page.js';
import { getCurrentBusinessDate } from '../../features/requests/utils/current-business-date.js';
import { createCorrectionRequestSearchSchema } from '../../features/requests/types/correction-request-search.schema.js';
import { CORRECTION_REQUEST_SUBMITTED_MESSAGE } from '../../features/requests/utils/requests-messages.js';

// The trailing underscore keeps this form out of the Requests list layout, so it renders on its own (as the overtime
// form does). The route decides where a submission leads. `?date=` pre-fills the business date (for example from History).
export const Route = createFileRoute('/_authenticated/requests_/corrections/new')({
  validateSearch: (search: Record<string, unknown>) =>
    createCorrectionRequestSearchSchema(getCurrentBusinessDate()).parse(search),
  component: NewCorrectionRequestRoute,
});

function NewCorrectionRequestRoute() {
  const { date } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { showToast } = useToast();

  return (
    <CorrectionRequestPage
      initialBusinessDate={date}
      onSubmitted={() => {
        showToast({ variant: 'success', message: CORRECTION_REQUEST_SUBMITTED_MESSAGE });
        void navigate({ to: '/requests', search: { tab: 'corrections' } });
      }}
    />
  );
}
