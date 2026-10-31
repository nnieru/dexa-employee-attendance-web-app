import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the attendance summary (T-EWEB-07) is built.
export const Route = createFileRoute('/_authenticated/history')({
  component: HistoryPlaceholderPage,
});

function HistoryPlaceholderPage() {
  return <ComingSoonPage title="History" description="Your attendance summary for a date range." />;
}
