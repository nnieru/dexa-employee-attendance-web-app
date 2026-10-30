import {
  employeeLookupRequestSchema,
  type EmployeeLookupItem,
  type EmployeeLookupRequest,
} from '@dexa/contracts';
import { ServiceAuthGuard } from '@dexa/common';
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  EMPLOYEE_LOOKUP_SERVICE,
  type IEmployeeLookupService,
} from './employee-lookup-service.interface.js';

// Every service may call this route with a service token addressed to employee-service. A user token is
// refused by ServiceAuthGuard, so employees cannot read other employees' names through this route.
@Controller('internal/employees')
@UseGuards(ServiceAuthGuard)
export class EmployeeLookupController {
  constructor(
    @Inject(EMPLOYEE_LOOKUP_SERVICE) private readonly employeeLookups: IEmployeeLookupService,
  ) {}

  // POST because the ID list is too large for a query string. The call only reads, so it answers 200.
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookupEmployees(
    @Body(new ZodValidationPipe(employeeLookupRequestSchema)) request: EmployeeLookupRequest,
  ): Promise<EmployeeLookupItem[]> {
    return this.employeeLookups.lookupEmployees(request.accountIds);
  }
}
