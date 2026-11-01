import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import {
  approveCorrectionRequestSchema,
  ownRequestListQuerySchema,
  rejectCorrectionRequestSchema,
  requestIdSchema,
  requestReviewQueueQuerySchema,
  Role,
  submitCorrectionRequestSchema,
  type ApproveCorrectionRequest,
  type CorrectionRequest,
  type CorrectionRequestPage,
  type CorrectionRequestReviewPage,
  type OwnRequestListQuery,
  type RejectCorrectionRequest,
  type RequestReviewQueueQuery,
  type SubmitCorrectionRequest,
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
  Query,
} from '@nestjs/common';
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

  // The requester is the verified token's account. The query is validated here and again by attendance-service.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me')
  listOwnRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ownRequestListQuerySchema)) query: OwnRequestListQuery,
  ): Promise<CorrectionRequestPage> {
    return this.correctionRequests.listOwnRequests(user, query);
  }

  // HR only. The queue is read from attendance-service, which checks the role again and compares the requester with
  // the token's account for isOwnRequest.
  @Roles(Role.HR)
  @Get()
  listReviewQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(requestReviewQueueQuerySchema)) query: RequestReviewQueueQuery,
  ): Promise<CorrectionRequestReviewPage> {
    return this.correctionRequests.listReviewQueue(user, query);
  }

  // HR only. The gateway checks the role, and attendance-service checks it again and refuses a reviewer who is the
  // requester (APR-4). The reviewer is the token's account; the body carries only the reason.
  @Roles(Role.HR)
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveCorrection(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(approveCorrectionRequestSchema)) body: ApproveCorrectionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CorrectionRequest> {
    return this.correctionRequests.approveCorrection(user, requestId, body);
  }

  @Roles(Role.HR)
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  rejectCorrection(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(rejectCorrectionRequestSchema)) body: RejectCorrectionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CorrectionRequest> {
    return this.correctionRequests.rejectCorrection(user, requestId, body);
  }
}
