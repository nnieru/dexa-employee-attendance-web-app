import { createFileRoute } from '@tanstack/react-router';
import { PageShell } from '@dexa/ui';

// Placeholder post-login target. The shell, route guard and attendance actions are added by later tasks.
export const Route = createFileRoute('/attendance')({ component: AttendancePlaceholderPage });

function AttendancePlaceholderPage() {
  return <PageShell title="Attendance" description="Attendance actions appear here." />;
}
