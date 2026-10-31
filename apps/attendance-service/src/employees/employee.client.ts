import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import { API_PREFIX, employeeLookupResponseSchema, type EmployeeLookupItem } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IEmployeeClient } from './employee-client.interface.js';

const EMPLOYEE_LOOKUP_PATH = `/${API_PREFIX}/internal/employees/lookup`;

/**
 * Calls employee-service's internal lookup with this service's own token. The HR user's token is never forwarded:
 * the route authorizes the calling service, and this service has already authorized HR.
 */
@Injectable()
export class EmployeeClient implements IEmployeeClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  lookupEmployees(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]> {
    return this.httpClient.post({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: EMPLOYEE_LOOKUP_PATH,
      body: { accountIds: [...accountIds] },
      responseSchema: employeeLookupResponseSchema,
    });
  }
}
