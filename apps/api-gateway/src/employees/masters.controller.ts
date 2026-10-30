import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { Roles } from '@dexa/common';
import { Role, type MasterOption } from '@dexa/contracts';
import {
  EMPLOYEE_SERVICE_CLIENT,
  type IEmployeeServiceClient,
} from './employee-service-client.interface.js';
import { readBearerToken } from '../auth/read-bearer-token.js';

// The HR lookups that position and status pickers read. The global guards verify the token and the
// role; employee-service checks the role again on these routes.
@Controller()
export class MastersController {
  constructor(
    @Inject(EMPLOYEE_SERVICE_CLIENT) private readonly employeeService: IEmployeeServiceClient,
  ) {}

  @Roles(Role.HR)
  @Get('positions')
  listPositions(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<MasterOption[]> {
    return this.employeeService.listPositions(readBearerToken(authorization));
  }

  @Roles(Role.HR)
  @Get('employee-statuses')
  listEmployeeStatuses(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<MasterOption[]> {
    return this.employeeService.listEmployeeStatuses(readBearerToken(authorization));
  }
}
