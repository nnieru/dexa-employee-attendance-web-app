import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the attendance monitoring (T-AWEB-06) is built.
export const Route = createFileRoute('/_authenticated/attendance')({
  component: AttendancePlaceholderPage,
});

function AttendancePlaceholderPage() {
  return <ComingSoonPage title="Attendance" description="Attendance records for all employees." />;
}
