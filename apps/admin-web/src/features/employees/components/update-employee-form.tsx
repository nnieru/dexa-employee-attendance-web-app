import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { UseQueryResult } from '@tanstack/react-query';
import type { EmployeeDetail, MasterOption } from '@dexa/contracts';
import { Alert, Button, TextField } from '@dexa/ui';
import { useUpdateEmployee } from '../hooks/use-update-employee.js';
import {
  updateEmployeeFormSchema,
  type UpdateEmployeeFormValues,
} from '../types/update-employee-form.schema.js';
import {
  getUpdateEmployeeErrorMessage,
  getUpdateEmployeeFieldError,
  isPartialUpdateError,
} from '../utils/update-employee-messages.js';
import {
  hasUpdateEmployeeChanges,
  isDeactivatingChange,
  toUpdateEmployeeChanges,
  toUpdateEmployeeRequest,
  type UpdateEmployeeChanges,
} from '../utils/to-update-employee-request.js';
import { toUpdateEmployeeFormValues } from '../utils/to-update-employee-form-values.js';
import { DeactivateEmployeeDialog } from './deactivate-employee-dialog.js';
import { MasterOptionSelect } from './master-option-select.js';

const OWN_STATUS_HINT = 'You cannot change the employment status of your own account.';
const NOT_AVAILABLE_EMAIL_HINT = 'Not available from the account service.';
const EMAIL_HINT = 'The company email is managed by the account and cannot be changed here.';
const PASSWORD_HINT =
  'Leave empty to keep the current password. Otherwise use the same rules as a new password.';

type UpdateEmployeeFormProps = {
  /** The signed-in HR account, or undefined while it is unknown. */
  currentAccountId: string | undefined;
  employee: EmployeeDetail;
  employeeStatuses: UseQueryResult<ReadonlyArray<MasterOption>, Error>;
  onCancel: () => void;
  onSaved: (employee: EmployeeDetail) => void;
  positions: UseQueryResult<ReadonlyArray<MasterOption>, Error>;
};

/**
 * One edit session. The stored employee is the baseline: only changed fields are sent. A deactivating save waits
 * for confirmation. After a partial failure, the next save repeats the status so the Auth account is brought in line.
 */
export function UpdateEmployeeForm({
  currentAccountId,
  employee,
  employeeStatuses,
  onCancel,
  onSaved,
  positions,
}: UpdateEmployeeFormProps) {
  const [shouldResendStatus, setShouldResendStatus] = useState(false);
  const [pendingDeactivation, setPendingDeactivation] = useState<UpdateEmployeeChanges | null>(
    null,
  );
  const updateMutation = useUpdateEmployee(employee.accountId);
  const storedValues = toUpdateEmployeeFormValues(employee);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<UpdateEmployeeFormValues>({
    resolver: zodResolver(updateEmployeeFormSchema),
    defaultValues: storedValues,
  });

  const statusOptions = employeeStatuses.data ?? [];
  const isOwnAccount = currentAccountId !== undefined && currentAccountId === employee.accountId;
  const enteredValues = useWatch({ control });
  const hasChanges = hasUpdateEmployeeChanges(
    toUpdateEmployeeChanges(enteredValues, employee, shouldResendStatus),
  );
  const isGeneralErrorShown =
    updateMutation.isError && getUpdateEmployeeFieldError(updateMutation.error) === undefined;

  function saveChanges(changes: UpdateEmployeeChanges) {
    updateMutation.mutate(toUpdateEmployeeRequest(changes), {
      onSuccess: (savedEmployee) => {
        setPendingDeactivation(null);
        onSaved(savedEmployee);
      },
      onError: (error) => {
        setPendingDeactivation(null);
        if (isPartialUpdateError(error)) setShouldResendStatus(true);
        const fieldError = getUpdateEmployeeFieldError(error);
        if (fieldError !== undefined) {
          setError(fieldError.field, { type: 'server', message: fieldError.message });
        }
      },
    });
  }

  function submitEmployee(values: UpdateEmployeeFormValues) {
    if (updateMutation.isPending) return;
    const changes = toUpdateEmployeeChanges(values, employee, shouldResendStatus);
    if (!hasUpdateEmployeeChanges(changes)) return;
    if (isDeactivatingChange(changes, statusOptions)) {
      setPendingDeactivation(changes);
      return;
    }
    saveChanges(changes);
  }

  function confirmDeactivation() {
    if (pendingDeactivation === null) return;
    saveChanges(pendingDeactivation);
  }

  return (
    <>
      <form className="employee-form" noValidate onSubmit={handleSubmit(submitEmployee)}>
        <TextField
          label="Name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Company email"
          type="email"
          value={employee.email ?? ''}
          readOnly
          hint={employee.email === null ? NOT_AVAILABLE_EMAIL_HINT : EMAIL_HINT}
        />
        <MasterOptionSelect
          label="Position"
          placeholder="Select a position"
          loadFailureMessage="Positions could not be loaded."
          currentOptionId={employee.position.id}
          lookup={positions}
          error={errors.positionId?.message}
          {...register('positionId')}
        />
        <MasterOptionSelect
          label="Employment status"
          placeholder="Select an employment status"
          loadFailureMessage="Employment statuses could not be loaded."
          currentOptionId={employee.employeeStatus.id}
          customHint={isOwnAccount ? OWN_STATUS_HINT : undefined}
          disabled={isOwnAccount}
          lookup={employeeStatuses}
          error={errors.employeeStatusId?.message}
          {...register('employeeStatusId')}
        />
        <TextField
          label="Phone number"
          type="tel"
          autoComplete="off"
          inputMode="tel"
          hint="Optional. Digits with an optional leading +."
          error={errors.phoneNumber?.message}
          {...register('phoneNumber')}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        {isGeneralErrorShown && (
          <Alert variant="error">{getUpdateEmployeeErrorMessage(updateMutation.error)}</Alert>
        )}
        <div className="employee-form__actions">
          <Button type="submit" isLoading={updateMutation.isPending} disabled={!hasChanges}>
            Save changes
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={updateMutation.isPending}>
            Cancel
          </Button>
        </div>
      </form>
      <DeactivateEmployeeDialog
        employeeName={employee.name}
        isBusy={updateMutation.isPending}
        open={pendingDeactivation !== null}
        onCancel={() => setPendingDeactivation(null)}
        onConfirm={confirmDeactivation}
      />
    </>
  );
}
