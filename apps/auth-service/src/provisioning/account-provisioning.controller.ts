import { ServiceAuthGuard } from '@dexa/common';
import {
  accountProvisioningOperationIdSchema,
  accountProvisioningRequestSchema,
  type AccountProvisioningOperation,
  type AccountProvisioningRequest,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  ACCOUNT_PROVISIONING_SERVICE,
  type IAccountProvisioningService,
} from './account-provisioning-service.interface.js';
import { EmployeeServiceCallerGuard } from './employee-service-caller.guard.js';

// Every route answers 200, including the create. A first create and an idempotent replay return the same
// shape, so the caller does not need to tell them apart by status code.
@Controller('internal/account-provisioning-operations')
@UseGuards(ServiceAuthGuard, EmployeeServiceCallerGuard)
export class AccountProvisioningController {
  constructor(
    @Inject(ACCOUNT_PROVISIONING_SERVICE)
    private readonly provisioning: IAccountProvisioningService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  createOperation(
    @Body(new ZodValidationPipe(accountProvisioningRequestSchema))
    request: AccountProvisioningRequest,
  ): Promise<AccountProvisioningOperation> {
    return this.provisioning.createOperation(request);
  }

  @Post(':operationId/activation')
  @HttpCode(HttpStatus.OK)
  activateOperation(
    @Param('operationId', new ZodValidationPipe(accountProvisioningOperationIdSchema))
    operationId: string,
  ): Promise<AccountProvisioningOperation> {
    return this.provisioning.activateOperation(operationId);
  }

  @Get(':operationId')
  getOperation(
    @Param('operationId', new ZodValidationPipe(accountProvisioningOperationIdSchema))
    operationId: string,
  ): Promise<AccountProvisioningOperation> {
    return this.provisioning.getOperation(operationId);
  }
}
