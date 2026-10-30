import { JwtAuthGuard, Roles, RolesGuard } from '@dexa/common';
import {
  employeeListQuerySchema,
  Role,
  type EmployeeListPage,
  type EmployeeListQuery,
} from '@dexa/contracts';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  EMPLOYEE_LIST_SERVICE,
  type IEmployeeListService,
} from './employee-list-service.interface.js';

// The gateway checks the role too. This service checks it again, so the list stays closed if the gateway is bypassed.
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HR)
export class EmployeeListController {
  constructor(@Inject(EMPLOYEE_LIST_SERVICE) private readonly employeeList: IEmployeeListService) {}

  @Get()
  listEmployees(
    @Query(new ZodValidationPipe(employeeListQuerySchema)) query: EmployeeListQuery,
  ): Promise<EmployeeListPage> {
    return this.employeeList.listEmployees(query);
  }
}
