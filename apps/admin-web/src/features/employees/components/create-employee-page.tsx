import { PageShell } from '@dexa/ui';
import type { EmployeeDetail } from '@dexa/contracts';
import { CreateEmployeeForm } from './create-employee-form.js';

type CreateEmployeePageProps = {
  onCancel: () => void;
  onCreated: (employee: EmployeeDetail) => void;
};

/** Add employee (ADM-1). The page only frames the form; the route decides where a save or a cancel goes. */
export function CreateEmployeePage({ onCancel, onCreated }: CreateEmployeePageProps) {
  return (
    <PageShell
      as="div"
      title="Add employee"
      description="Create the employee account and profile. The new employee can sign in right away."
    >
      <CreateEmployeeForm onCancel={onCancel} onCreated={onCreated} />
    </PageShell>
  );
}
