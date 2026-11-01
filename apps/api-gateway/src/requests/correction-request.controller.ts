import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import {
  Role,
  submitCorrectionRequestSchema,
  type CorrectionRequest,
  type SubmitCorrectionRequest,
} from '@dexa/contracts';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  CORRECTION_REQUEST_CLIENT,
  type ICorrectionRequestClient,
} from './correction-request-client.interface.js';

// The body is strict per outcome here and again in attendance-service, so a client-supplied requester or a time on a
// leave outcome is refused at the edge. The requester is the verified token's account, forwarded through onBehalfOf.
@Controller('attendance-corrections')
export class CorrectionRequestController {
  constructor(
    @Inject(CORRECTION_REQUEST_CLIENT)
    private readonly correctionRequests: ICorrectionRequestClient,
  ) {}

  @Roles(Role.EMPLOYEE, Role.HR)
  @Post()
  submitCorrection(
    @Body(new ZodValidationPipe(submitCorrectionRequestSchema)) request: SubmitCorrectionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CorrectionRequest> {
    return this.correctionRequests.submitCorrection(user, request);
  }
}
