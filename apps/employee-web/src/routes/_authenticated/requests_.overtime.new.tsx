import { createFileRoute } from '@tanstack/react-router';
import { useToast } from '@dexa/ui';
import { OvertimeRequestPage } from '../../features/requests/components/overtime-request-page.js';
import { OVERTIME_REQUEST_SUBMITTED_MESSAGE } from '../../features/requests/utils/requests-messages.js';

// The trailing underscore keeps this form out of the Requests list layout, so it renders on its own (as the admin
// create-employee page does). The route decides where a submission leads.
export const Route = createFileRoute('/_authenticated/requests_/overtime/new')({
  component: NewOvertimeRequestRoute,
});

function NewOvertimeRequestRoute() {
  const navigate = Route.useNavigate();
  const { showToast } = useToast();

  return (
    <OvertimeRequestPage
      onSubmitted={() => {
        showToast({ variant: 'success', message: OVERTIME_REQUEST_SUBMITTED_MESSAGE });
        void navigate({ to: '/requests', search: { tab: 'overtime' } });
      }}
    />
  );
}
