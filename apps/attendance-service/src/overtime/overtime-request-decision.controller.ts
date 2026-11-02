import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  approveOvertimeRequestSchema,
  rejectOvertimeRequestSchema,
  requestIdSchema,
  Role,
  type ApproveOvertimeRequest,
  type OvertimeRequest,
  type RejectOvertimeRequest,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  OVERTIME_REQUEST_DECISION_SERVICE,
  type IOvertimeRequestDecisionService,
} from './overtime-request-decision.service.interface.js';

// HR only, checked here as well as at the gateway. The reviewer is the token's account, and the service refuses a
// reviewer who is the requester. A decision answers 200 whether it applied or replayed a recorded decision.
@Controller('overtime-requests')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class OvertimeRequestDecisionController {
  constructor(
    @Inject(OVERTIME_REQUEST_DECISION_SERVICE)
    private readonly overtimeRequestDecisions: IOvertimeRequestDecisionService,
  ) {}

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(approveOvertimeRequestSchema)) body: ApproveOvertimeRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OvertimeRequest> {
    return this.overtimeRequestDecisions.approve(user.accountId, requestId, body);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(rejectOvertimeRequestSchema)) body: RejectOvertimeRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OvertimeRequest> {
    return this.overtimeRequestDecisions.reject(user.accountId, requestId, body);
  }
}
