import { createFileRoute } from '@tanstack/react-router';
import { AttendanceMonitoringPage } from '../../features/attendance/components/attendance-monitoring-page.js';
import { attendanceMonitoringSearchSchema } from '../../features/attendance/types/attendance-monitoring-search.schema.js';
import { getCurrentBusinessDate } from '../../features/attendance/utils/current-business-date.js';

// The range, employee, and page live in the URL, so a reload or a shared link shows the same list (PRD ADM-4).
export const Route = createFileRoute('/_authenticated/attendance')({
  validateSearch: attendanceMonitoringSearchSchema,
  component: AttendanceRoute,
});

function AttendanceRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = getCurrentBusinessDate();

  return (
    <AttendanceMonitoringPage
      search={search}
      today={today}
      // A new range or employee starts on page 1. The page only re-reads the URL state, so no date is kept here.
      onRangeSearch={(range) =>
        void navigate({
          search: (previous) => ({ ...previous, from: range.from, to: range.to, page: 1 }),
        })
      }
      onEmployeeChange={(employeeId) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            // An empty choice leaves employeeId out of the URL, the same as no filter.
            employeeId: employeeId.length > 0 ? employeeId : undefined,
            page: 1,
          }),
        })
      }
      onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page }) })}
    />
  );
}
