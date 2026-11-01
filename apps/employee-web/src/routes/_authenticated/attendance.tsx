import { createFileRoute } from '@tanstack/react-router';
import { AttendancePage } from '../../features/attendance/components/attendance-page.js';

export const Route = createFileRoute('/_authenticated/attendance')({
  component: AttendancePage,
});
