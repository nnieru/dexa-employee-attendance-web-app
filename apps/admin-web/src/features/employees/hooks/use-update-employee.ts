import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorCode, type EmployeeDetail, type UpdateEmployeeRequest } from '@dexa/contracts';
import { ApiError } from '@dexa/api-client';
import { useSession } from '@dexa/session';
import { employeeQueryKeys } from '../api/employee-query-keys.js';
import { updateEmployee } from '../api/update-employee.js';

/**
 * Sends one update for an employee. A success refreshes the list and this employee's detail. A partial failure
 * (EMPLOYEE_UPDATE_INCOMPLETE) reloads the detail, because some steps may have saved.
 */
export function useUpdateEmployee(accountId: string) {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation<EmployeeDetail, Error, UpdateEmployeeRequest>({
    mutationFn: (request) => updateEmployee(apiClient, accountId, request),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.detail(accountId) }),
      ]);
    },
    onError: async (error) => {
      if (!(error instanceof ApiError) || error.code !== ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE)
        return;
      await queryClient.invalidateQueries({ queryKey: employeeQueryKeys.detail(accountId) });
    },
  });
}
