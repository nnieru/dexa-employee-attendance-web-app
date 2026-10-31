import { createFileRoute } from '@tanstack/react-router';
import { PageShell } from '@dexa/ui';

// Placeholder post-login target. The attendance actions are added by T-EWEB-06.
export const Route = createFileRoute('/_authenticated/attendance')({
  component: AttendancePlaceholderPage,
});

function AttendancePlaceholderPage() {
  return <PageShell as="div" title="Attendance" description="Attendance actions appear here." />;
}
