import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Role, type EmployeeDetail } from '@dexa/contracts';
import { Alert, Button, TextField } from '@dexa/ui';
import { useCreateEmployee } from '../hooks/use-create-employee.js';
import { useEmployeeStatuses } from '../hooks/use-employee-statuses.js';
import { usePositions } from '../hooks/use-positions.js';
import {
  createEmployeeFormSchema,
  type CreateEmployeeFormValues,
} from '../types/create-employee-form.schema.js';
import { createOperationId } from '../utils/create-operation-id.js';
import {
  DUPLICATE_EMAIL_FIELD_MESSAGE,
  getCreateEmployeeErrorMessage,
  isDuplicateEmailConflict,
} from '../utils/create-employee-messages.js';
import { ROLE_OPTIONS } from '../utils/create-employee-role-options.js';
import { toCreateEmployeeRequest } from '../utils/to-create-employee-request.js';
import { MasterOptionSelect } from './master-option-select.js';
import { SelectField } from './select-field.js';

const EMPTY_FORM_VALUES: CreateEmployeeFormValues = {
  name: '',
  email: '',
  positionId: '',
  employeeStatusId: '',
  phoneNumber: '',
  role: Role.EMPLOYEE,
  initialPassword: '',
};

type CreateEmployeeFormProps = {
  onCancel: () => void;
  onCreated: (employee: EmployeeDetail) => void;
};

/**
 * One form session. The operation ID is created with the form and kept for every submit in this session, so a retry
 * after a failure sends the same ID. A new session, such as a second visit to the page, gets a new one.
 */
export function CreateEmployeeForm({ onCancel, onCreated }: CreateEmployeeFormProps) {
  const [operationId] = useState(createOperationId);
  const createMutation = useCreateEmployee();
  const positions = usePositions();
  const employeeStatuses = useEmployeeStatuses();
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<CreateEmployeeFormValues>({
    resolver: zodResolver(createEmployeeFormSchema),
    defaultValues: EMPTY_FORM_VALUES,
  });

  const areLookupsReady = positions.isSuccess && employeeStatuses.isSuccess;
  const isGeneralErrorShown =
    createMutation.isError && !isDuplicateEmailConflict(createMutation.error);

  function submitEmployee(values: CreateEmployeeFormValues) {
    if (createMutation.isPending) return;
    createMutation.mutate(toCreateEmployeeRequest(values, operationId), {
      onSuccess: onCreated,
      onError: (error) => {
        if (!isDuplicateEmailConflict(error)) return;
        setError('email', { type: 'server', message: DUPLICATE_EMAIL_FIELD_MESSAGE });
      },
    });
  }

  return (
    <form className="employee-create-form" noValidate onSubmit={handleSubmit(submitEmployee)}>
      <TextField
        label="Name"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Company email"
        type="email"
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />
      <MasterOptionSelect
        label="Position"
        placeholder="Select a position"
        loadFailureMessage="Positions could not be loaded."
        lookup={positions}
        error={errors.positionId?.message}
        {...register('positionId')}
      />
      <MasterOptionSelect
        label="Employment status"
        placeholder="Select an employment status"
        loadFailureMessage="Employment statuses could not be loaded."
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
      <SelectField label="Role" error={errors.role?.message} {...register('role')}>
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Initial password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with letters and numbers."
        error={errors.initialPassword?.message}
        {...register('initialPassword')}
      />
      {isGeneralErrorShown && (
        <Alert variant="error">{getCreateEmployeeErrorMessage(createMutation.error)}</Alert>
      )}
      <div className="employee-create-form__actions">
        <Button type="submit" isLoading={createMutation.isPending} disabled={!areLookupsReady}>
          Add employee
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={createMutation.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
