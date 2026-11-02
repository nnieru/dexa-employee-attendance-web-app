import type { TodayAttendanceResponse } from '@dexa/contracts';
import { PageShell } from '@dexa/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTodayAttendance } from '../hooks/use-today-attendance.js';
import { ATTENDANCE_PAGE_DESCRIPTION } from '../utils/attendance-copy.js';
import { AttendanceLoadError } from './attendance-load-error.js';
import { AttendanceSkeleton } from './attendance-skeleton.js';
import { AttendanceTodayPanel } from './attendance-today-panel.js';

export function AttendancePage() {
  const todayQuery = useTodayAttendance();
  return (
    <PageShell as="div" title="Attendance" description={ATTENDANCE_PAGE_DESCRIPTION}>
      <AttendanceContent todayQuery={todayQuery} />
    </PageShell>
  );
}

// A read that failed replaces the panel rather than sitting beside it. Without a confirmed state the employee
// cannot act, so no punch is offered on data that may be out of date (conflict).
function AttendanceContent({
  todayQuery,
}: {
  todayQuery: UseQueryResult<TodayAttendanceResponse>;
}) {
  if (todayQuery.isError) {
    return (
      <AttendanceLoadError
        error={todayQuery.error}
        isRetrying={todayQuery.isFetching}
        onRetry={() => {
          void todayQuery.refetch();
        }}
      />
    );
  }
  if (todayQuery.data === undefined) return <AttendanceSkeleton />;
  return <AttendanceTodayPanel today={todayQuery.data} />;
}
