import { createFileRoute } from '@tanstack/react-router';
import { useToast } from '@dexa/ui';
import { UpdateEmployeePage } from '../../features/employees/components/update-employee-page.js';
import { getEmployeeUpdatedMessage } from '../../features/employees/utils/update-employee-messages.js';

// The trailing underscore keeps this page out of the employees list layout, so it renders on its own.
export const Route = createFileRoute('/_authenticated/employees_/$employeeId/edit')({
  component: UpdateEmployeeRoute,
});

function UpdateEmployeeRoute() {
  const { employeeId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { showToast } = useToast();

  function returnToEmployees() {
    void navigate({ to: '/employees' });
  }

  return (
    <UpdateEmployeePage
      accountId={employeeId}
      onCancel={returnToEmployees}
      onSaved={(employee) => {
        showToast({ variant: 'success', message: getEmployeeUpdatedMessage(employee.name) });
        returnToEmployees();
      }}
    />
  );
}
