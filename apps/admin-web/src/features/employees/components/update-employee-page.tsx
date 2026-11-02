import { Alert, Button, PageShell } from '@dexa/ui';
import type { EmployeeDetail } from '@dexa/contracts';
import { useCurrentAccount } from '../hooks/use-current-account.js';
import { useEmployeeDetail } from '../hooks/use-employee-detail.js';
import { useEmployeeStatuses } from '../hooks/use-employee-statuses.js';
import { usePositions } from '../hooks/use-positions.js';
import { isEmployeeNotFoundError } from '../utils/update-employee-messages.js';
import { UpdateEmployeeForm } from './update-employee-form.js';

const LOADING_TEXT = 'Loading employee.';
const NOT_FOUND_MESSAGE = 'This employee could not be found.';
const OPTIONS_FAILURE_MESSAGE = 'The options for this form could not be loaded. Try again.';
const LOAD_FAILURE_MESSAGE = 'The employee could not be loaded. Try again.';
const RETRY_LABEL = 'Try again';
const BACK_LABEL = 'Back to employees';

type UpdateEmployeePageProps = {
  accountId: string;
  onCancel: () => void;
  onSaved: (employee: EmployeeDetail) => void;
};

/**
 * Edit employee. The page loads the employee and the two HR pickers, and shows the form only when all of them
 * are available, so every select starts with its stored value. The route decides where a save or a cancel goes.
 */
export function UpdateEmployeePage({ accountId, onCancel, onSaved }: UpdateEmployeePageProps) {
  const employee = useEmployeeDetail(accountId);
  const positions = usePositions();
  const employeeStatuses = useEmployeeStatuses();
  const currentAccount = useCurrentAccount();

  const loadedEmployee = employee.data;
  return (
    <PageShell
      as="div"
      title="Edit employee"
      description="Change the employee's name, position, phone number, employment status, or password."
    >
      {loadedEmployee !== undefined &&
      positions.data !== undefined &&
      employeeStatuses.data !== undefined ? (
        <UpdateEmployeeForm
          currentAccountId={currentAccount.data?.id}
          employee={loadedEmployee}
          employeeStatuses={employeeStatuses}
          onCancel={onCancel}
          onSaved={onSaved}
          positions={positions}
        />
      ) : (
        <UpdateEmployeeStatus
          employeeError={employee.error}
          hasEmployeeFailed={employee.isError && employee.data === undefined}
          hasOptionsFailed={
            (positions.isError && positions.data === undefined) ||
            (employeeStatuses.isError && employeeStatuses.data === undefined)
          }
          onBack={onCancel}
          onRetry={() => {
            void employee.refetch();
            void positions.refetch();
            void employeeStatuses.refetch();
          }}
        />
      )}
    </PageShell>
  );
}

type UpdateEmployeeStatusProps = {
  employeeError: Error | null;
  hasEmployeeFailed: boolean;
  hasOptionsFailed: boolean;
  onBack: () => void;
  onRetry: () => void;
};

/** Loading, not-found, and error states while the form is not ready. A not-found answer has no retry. */
function UpdateEmployeeStatus({
  employeeError,
  hasEmployeeFailed,
  hasOptionsFailed,
  onBack,
  onRetry,
}: UpdateEmployeeStatusProps) {
  if (hasEmployeeFailed && isEmployeeNotFoundError(employeeError)) {
    return (
      <Alert
        variant="error"
        action={
          <Button variant="secondary" onClick={onBack}>
            {BACK_LABEL}
          </Button>
        }
      >
        {NOT_FOUND_MESSAGE}
      </Alert>
    );
  }
  if (hasEmployeeFailed) {
    return (
      <Alert
        variant="error"
        action={
          <Button variant="secondary" onClick={onRetry}>
            {RETRY_LABEL}
          </Button>
        }
      >
        {LOAD_FAILURE_MESSAGE}
      </Alert>
    );
  }
  if (hasOptionsFailed) {
    return (
      <Alert
        variant="error"
        action={
          <Button variant="secondary" onClick={onRetry}>
            {RETRY_LABEL}
          </Button>
        }
      >
        {OPTIONS_FAILURE_MESSAGE}
      </Alert>
    );
  }
  return <p role="status">{LOADING_TEXT}</p>;
}
