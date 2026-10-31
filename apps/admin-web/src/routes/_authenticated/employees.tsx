import { createFileRoute } from '@tanstack/react-router';
import { EmployeeListPage } from '../../features/employees/components/employee-list-page.js';
import { employeeListSearchSchema } from '../../features/employees/types/employee-list-search.schema.js';

// The search term and page live in the URL, so a reload or a shared link shows the same list.
export const Route = createFileRoute('/_authenticated/employees')({
  validateSearch: employeeListSearchSchema,
  component: EmployeesRoute,
});

function EmployeesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <EmployeeListPage
      search={search}
      onSearch={(searchTerm) =>
        // A blank term leaves q out of the URL, the same as no search.
        void navigate({
          search: (previous) => ({
            ...previous,
            q: searchTerm.length > 0 ? searchTerm : undefined,
            page: 1,
          }),
        })
      }
      onPageChange={(page) => void navigate({ search: (previous) => ({ ...previous, page }) })}
    />
  );
}
