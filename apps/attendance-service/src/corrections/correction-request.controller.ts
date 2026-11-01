import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  Role,
  submitCorrectionRequestSchema,
  type CorrectionRequest,
  type SubmitCorrectionRequest,
} from '@dexa/contracts';
import { Body, Controller, HttpStatus, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  CORRECTION_REQUEST_SERVICE,
  type ICorrectionRequestService,
} from './correction-request.service.interface.js';

// The identity comes only from the verified token. The body is strict per outcome, so a requester, a status, or a time
// on a leave outcome sent by the client is refused.
@Controller('attendance-corrections')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE, Role.HR)
export class CorrectionRequestController {
  constructor(
    @Inject(CORRECTION_REQUEST_SERVICE)
    private readonly correctionRequests: ICorrectionRequestService,
  ) {}

  // A new request answers 201. An identical retry answers 200 with the request that the first submission saved (APR-5).
  @Post()
  async submit(
    @Body(new ZodValidationPipe(submitCorrectionRequestSchema)) request: SubmitCorrectionRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CorrectionRequest> {
    const result = await this.correctionRequests.submit(user.accountId, request);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.request;
  }
}
