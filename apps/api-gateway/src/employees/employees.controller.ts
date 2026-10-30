import { Roles } from '@dexa/common';
import { Role, type OwnProfile } from '@dexa/contracts';
import { Controller, Get, Headers, Inject } from '@nestjs/common';
import {
  EMPLOYEE_SERVICE_CLIENT,
  type IEmployeeServiceClient,
} from './employee-service-client.interface.js';
import { readBearerToken } from '../auth/read-bearer-token.js';

// The employee's own profile. The gateway forwards the caller's token, and employee-service takes the
// account from that token, so no account ID is read from the request here.
@Controller('employees')
export class EmployeesController {
  constructor(
    @Inject(EMPLOYEE_SERVICE_CLIENT) private readonly employeeService: IEmployeeServiceClient,
  ) {}

  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me')
  getOwnProfile(@Headers('authorization') authorization: string | undefined): Promise<OwnProfile> {
    return this.employeeService.getOwnProfile(readBearerToken(authorization));
  }
}
