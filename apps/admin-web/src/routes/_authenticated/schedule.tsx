import { createFileRoute } from '@tanstack/react-router';
import { WorkSchedulePage } from '../../features/schedule/components/work-schedule-page.js';
import { calendarExceptionSearchSchema } from '../../features/schedule/types/calendar-exception-search.schema.js';
import { getCurrentBusinessDate } from '../../features/schedule/utils/current-business-date.js';

// The calendar exception range and page live in the URL, so a reload or a shared link shows the same list (PRD SCH-5).
export const Route = createFileRoute('/_authenticated/schedule')({
  validateSearch: calendarExceptionSearchSchema,
  component: WorkScheduleRoute,
});

function WorkScheduleRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorkSchedulePage
      today={getCurrentBusinessDate()}
      calendarSearch={search}
      // A new range starts on page 1, so the page never points past the end of a shorter list.
      onCalendarRangeSearch={(range) =>
        void navigate({
          search: (previous) => ({ ...previous, from: range.from, to: range.to, page: 1 }),
        })
      }
      onCalendarPageChange={(page) =>
        void navigate({ search: (previous) => ({ ...previous, page }) })
      }
    />
  );
}
