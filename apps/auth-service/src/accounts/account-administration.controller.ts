import { ServiceAuthGuard } from '@dexa/common';
import {
  accountIdSchema,
  resetAccountPasswordRequestSchema,
  setAccountActiveStatusRequestSchema,
  type AccountStatus,
  type ResetAccountPasswordRequest,
  type SetAccountActiveStatusRequest,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { EmployeeServiceCallerGuard } from '../internal-callers/employee-service-caller.guard.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  ACCOUNT_ADMINISTRATION_SERVICE,
  type IAccountAdministrationService,
} from './account-administration.service.interface.js';

// Only employee-service may call these routes. It checks the HR role for the user and names the HR account as
// the actor, and this service checks that the actor is an eligible HR account.
@Controller('internal/accounts')
@UseGuards(ServiceAuthGuard, EmployeeServiceCallerGuard)
export class AccountAdministrationController {
  constructor(
    @Inject(ACCOUNT_ADMINISTRATION_SERVICE)
    private readonly administration: IAccountAdministrationService,
  ) {}

  @Put(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param('id', new ZodValidationPipe(accountIdSchema)) accountId: string,
    @Body(new ZodValidationPipe(resetAccountPasswordRequestSchema))
    request: ResetAccountPasswordRequest,
  ): Promise<void> {
    return this.administration.resetPassword(accountId, request);
  }

  @Put(':id/active-status')
  @HttpCode(HttpStatus.OK)
  setActiveStatus(
    @Param('id', new ZodValidationPipe(accountIdSchema)) accountId: string,
    @Body(new ZodValidationPipe(setAccountActiveStatusRequestSchema))
    request: SetAccountActiveStatusRequest,
  ): Promise<AccountStatus> {
    return this.administration.setActiveStatus(accountId, request);
  }
}
