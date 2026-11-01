import { createFileRoute } from '@tanstack/react-router';
import { ApprovalsPage } from '../../features/approvals/components/approvals-page.js';
import {
  approvalsSearchSchema,
  resolveApprovalsSearch,
} from '../../features/approvals/types/approvals-search.schema.js';
import { getCurrentBusinessDate } from '../../features/attendance/utils/current-business-date.js';

// The tab, filters, and page live in the URL, so a reload or a shared link shows the same queue (PRD APR-1).
export const Route = createFileRoute('/_authenticated/approvals')({
  validateSearch: approvalsSearchSchema,
  component: ApprovalsRoute,
});

function ApprovalsRoute() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = getCurrentBusinessDate();
  const search = resolveApprovalsSearch(rawSearch, today);

  return (
    <ApprovalsPage
      search={search}
      today={today}
      onTabChange={(tab) =>
        void navigate({ search: (previous) => ({ ...previous, tab, page: 1 }) })
      }
      onRangeSearch={(range) =>
        void navigate({
          search: (previous) => ({ ...previous, from: range.from, to: range.to, page: 1 }),
        })
      }
      onStatusChange={(status) =>
        void navigate({ search: (previous) => ({ ...previous, status, page: 1 }) })
      }
      onEmployeeChange={(employeeId) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            employeeId: employeeId.length > 0 ? employeeId : undefined,
            page: 1,
          }),
        })
      }
      onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page }) })}
    />
  );
}
