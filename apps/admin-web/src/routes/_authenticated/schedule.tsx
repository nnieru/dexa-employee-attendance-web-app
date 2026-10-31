import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the work schedule screen (T-AWEB-09) is built.
export const Route = createFileRoute('/_authenticated/schedule')({
  component: SchedulePlaceholderPage,
});

function SchedulePlaceholderPage() {
  return (
    <ComingSoonPage title="Schedule" description="The work schedule and its upcoming changes." />
  );
}
