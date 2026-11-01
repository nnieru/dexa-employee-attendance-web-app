import { createFileRoute } from '@tanstack/react-router';
import { useToast } from '@dexa/ui';
import { CreateEmployeePage } from '../../features/employees/components/create-employee-page.js';
import { getEmployeeCreatedMessage } from '../../features/employees/utils/create-employee-messages.js';

// The trailing underscore keeps this page out of the employees list layout, so it renders on its own.
export const Route = createFileRoute('/_authenticated/employees_/new')({
  component: CreateEmployeeRoute,
});

function CreateEmployeeRoute() {
  const navigate = Route.useNavigate();
  const { showToast } = useToast();

  function returnToEmployees() {
    void navigate({ to: '/employees' });
  }

  return (
    <CreateEmployeePage
      onCancel={returnToEmployees}
      onCreated={(employee) => {
        showToast({ variant: 'success', message: getEmployeeCreatedMessage(employee.name) });
        returnToEmployees();
      }}
    />
  );
}
