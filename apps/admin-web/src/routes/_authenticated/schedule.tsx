import { createFileRoute } from '@tanstack/react-router';
import { WorkSchedulePage } from '../../features/schedule/components/work-schedule-page.js';
import { getCurrentBusinessDate } from '../../features/schedule/utils/current-business-date.js';

export const Route = createFileRoute('/_authenticated/schedule')({
  component: WorkScheduleRoute,
});

function WorkScheduleRoute() {
  return <WorkSchedulePage today={getCurrentBusinessDate()} />;
}
