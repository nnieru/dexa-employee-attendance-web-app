import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the approvals queue (T-REQ-19) is built.
export const Route = createFileRoute('/_authenticated/approvals')({
  component: ApprovalsPlaceholderPage,
});

function ApprovalsPlaceholderPage() {
  return (
    <ComingSoonPage
      title="Approvals"
      description="Overtime and correction requests waiting for review."
    />
  );
}
