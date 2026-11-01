import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateEmployeeRequest } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { employeeQueryKeys } from '../api/employee-query-keys.js';
import { createEmployee } from '../api/create-employee.js';

/**
 * Sends the create request. The list is invalidated on success, so the employee appears when HR returns to it.
 * A failed request leaves the cache alone, and the form keeps its values for the retry.
 */
export function useCreateEmployee() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateEmployeeRequest) => createEmployee(apiClient, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: employeeQueryKeys.lists() }),
  });
}
