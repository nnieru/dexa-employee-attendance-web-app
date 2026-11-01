import { createEmployeeRequestSchema, type CreateEmployeeRequest } from '@dexa/contracts';
import type { CreateEmployeeFormValues } from '../types/create-employee-form.schema.js';

/** Builds the request body. An empty phone field is sent as null, which the contract requires as an explicit key. */
export function toCreateEmployeeRequest(
  values: CreateEmployeeFormValues,
  operationId: string,
): CreateEmployeeRequest {
  return createEmployeeRequestSchema.parse({
    ...values,
    operationId,
    phoneNumber: values.phoneNumber.length > 0 ? values.phoneNumber : null,
  });
}
