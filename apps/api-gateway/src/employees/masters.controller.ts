import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import { Role, type MasterOption } from '@dexa/contracts';
import {
  EMPLOYEE_SERVICE_CLIENT,
  type IEmployeeServiceClient,
} from './employee-service-client.interface.js';

// The HR lookups that position and status pickers read. The global guards verify the token and the
// role; employee-service checks the role again on these routes.
@Controller()
export class MastersController {
  constructor(
    @Inject(EMPLOYEE_SERVICE_CLIENT) private readonly employeeService: IEmployeeServiceClient,
  ) {}

  @Roles(Role.HR)
  @Get('positions')
  listPositions(@CurrentUser() user: AuthenticatedUser): Promise<MasterOption[]> {
    return this.employeeService.listPositions(user);
  }

  @Roles(Role.HR)
  @Get('employee-statuses')
  listEmployeeStatuses(@CurrentUser() user: AuthenticatedUser): Promise<MasterOption[]> {
    return this.employeeService.listEmployeeStatuses(user);
  }
}
