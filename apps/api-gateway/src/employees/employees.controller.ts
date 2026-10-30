import { Roles } from '@dexa/common';
import {
  Role,
  updateOwnProfileRequestSchema,
  type OwnProfile,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import { Body, Controller, Get, Headers, Inject, Patch } from '@nestjs/common';
import {
  EMPLOYEE_SERVICE_CLIENT,
  type IEmployeeServiceClient,
} from './employee-service-client.interface.js';
import { readBearerToken } from '../auth/read-bearer-token.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

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

  // The body is strict, so only the phone number can change here. Name, email, position, and status stay read only.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Patch('me')
  updateOwnProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(updateOwnProfileRequestSchema)) request: UpdateOwnProfileRequest,
  ): Promise<OwnProfile> {
    return this.employeeService.updateOwnProfile(readBearerToken(authorization), request);
  }
}
