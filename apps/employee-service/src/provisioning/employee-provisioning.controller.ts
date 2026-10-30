import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthenticatedUser } from '@dexa/common';
import {
  createEmployeeRequestSchema,
  Role,
  type CreateEmployeeRequest,
  type EmployeeDetail,
} from '@dexa/contracts';
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  EMPLOYEE_PROVISIONING_SERVICE,
  type IEmployeeProvisioningService,
} from './employee-provisioning.service.interface.js';

// HR only. The actor comes from the verified token, so the request body cannot name who is creating the employee.
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HR)
export class EmployeeProvisioningController {
  constructor(
    @Inject(EMPLOYEE_PROVISIONING_SERVICE)
    private readonly provisioning: IEmployeeProvisioningService,
  ) {}

  // Both a first create and a matching retry answer 201 with the same employee shape.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEmployeeRequestSchema)) request: CreateEmployeeRequest,
  ): Promise<EmployeeDetail> {
    return this.provisioning.createEmployee(user.accountId, request);
  }
}
