import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  requestReviewQueueQuerySchema,
  Role,
  type CorrectionRequestReviewPage,
  type RequestReviewQueueQuery,
} from '@dexa/contracts';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  CORRECTION_REQUEST_REVIEW_SERVICE,
  type ICorrectionRequestReviewService,
} from './correction-request-review.service.interface.js';

// HR only, checked here as well as at the gateway. The reviewer is the token's account, which is compared with each
// requester so that HR cannot review their own request (APR-4).
@Controller('attendance-corrections')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class CorrectionRequestReviewController {
  constructor(
    @Inject(CORRECTION_REQUEST_REVIEW_SERVICE)
    private readonly correctionRequestReviews: ICorrectionRequestReviewService,
  ) {}

  @Get()
  listReviewQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(requestReviewQueueQuerySchema)) query: RequestReviewQueueQuery,
  ): Promise<CorrectionRequestReviewPage> {
    return this.correctionRequestReviews.listReviewQueue(user.accountId, query);
  }
}
