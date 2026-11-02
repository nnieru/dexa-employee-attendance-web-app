import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  accountIdSchema,
  Role,
  updateEmployeeRequestSchema,
  type EmployeeDetail,
  type UpdateEmployeeRequest,
} from '@dexa/contracts';
import { Body, Controller, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  EMPLOYEE_UPDATE_SERVICE,
  type IEmployeeUpdateService,
} from './employee-update.service.interface.js';

// HR only. The actor is the verified token's account, so the body cannot name who makes the change. The
// self-service route PATCH employees/me is registered before this one (see AppModule), so `me` never reaches the
// UUID check here.
@Controller('employees')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class EmployeeUpdateController {
  constructor(
    @Inject(EMPLOYEE_UPDATE_SERVICE) private readonly employeeUpdate: IEmployeeUpdateService,
  ) {}

  @Patch(':accountId')
  async updateEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ZodValidationPipe(accountIdSchema)) accountId: string,
    @Body(new ZodValidationPipe(updateEmployeeRequestSchema)) request: UpdateEmployeeRequest,
  ): Promise<EmployeeDetail> {
    const result = await this.employeeUpdate.updateEmployee({
      actorAccountId: user.accountId,
      accountId,
      request,
    });
    return result.employee;
  }
}
