import { createFileRoute } from '@tanstack/react-router';
import { SummaryPage } from '../../features/summary/components/summary-page.js';
import { getCurrentBusinessDate } from '../../features/summary/utils/current-business-date.js';
import { createSummarySearchSchema } from '../../features/summary/types/summary-search.schema.js';

// The range and page live in the URL, so a reload or a shared link shows the same summary.
export const Route = createFileRoute('/_authenticated/history')({
  validateSearch: (search: Record<string, unknown>) =>
    createSummarySearchSchema(getCurrentBusinessDate()).parse(search),
  component: HistoryRoute,
});

function HistoryRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = getCurrentBusinessDate();

  return (
    <SummaryPage
      search={search}
      today={today}
      // A Search starts on page 1 of the new range. The page only re-reads the URL state, so no date is kept here.
      onSearch={(range) => void navigate({ search: { from: range.from, to: range.to, page: 1 } })}
      onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page }) })}
    />
  );
}
