import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  approveCorrectionRequestSchema,
  rejectCorrectionRequestSchema,
  requestIdSchema,
  Role,
  type ApproveCorrectionRequest,
  type CorrectionRequest,
  type RejectCorrectionRequest,
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
  CORRECTION_REQUEST_DECISION_SERVICE,
  type ICorrectionRequestDecisionService,
} from './correction-request-decision.service.interface.js';

// HR only, checked here as well as at the gateway. The reviewer is the token's account, and the service refuses a
// reviewer who is the requester. A decision answers 200 whether it applied or replayed a recorded decision.
@Controller('attendance-corrections')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class CorrectionRequestDecisionController {
  constructor(
    @Inject(CORRECTION_REQUEST_DECISION_SERVICE)
    private readonly correctionRequestDecisions: ICorrectionRequestDecisionService,
  ) {}

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(approveCorrectionRequestSchema)) body: ApproveCorrectionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CorrectionRequest> {
    return this.correctionRequestDecisions.approve(user.accountId, requestId, body);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(rejectCorrectionRequestSchema)) body: RejectCorrectionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CorrectionRequest> {
    return this.correctionRequestDecisions.reject(user.accountId, requestId, body);
  }
}
