import { createFileRoute } from '@tanstack/react-router';
import { RequestsPage } from '../../features/requests/components/requests-page.js';
import {
  requestsSearchSchema,
  resolveRequestsSearch,
} from '../../features/requests/types/requests-search.schema.js';

// The tab, the status and the page live in the URL, so a reload or a shared link shows the same list (PRD APR-6).
export const Route = createFileRoute('/_authenticated/requests')({
  validateSearch: requestsSearchSchema,
  component: RequestsRoute,
});

function RequestsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <RequestsPage
      search={resolveRequestsSearch(search)}
      // Changing the type or the status starts again on page 1; the page only re-reads the URL state.
      onTabChange={(tab) =>
        void navigate({ search: (previous) => ({ ...previous, tab, page: undefined }) })
      }
      onStatusChange={(status) =>
        void navigate({ search: (previous) => ({ ...previous, status, page: undefined }) })
      }
      onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page }) })}
    />
  );
}
