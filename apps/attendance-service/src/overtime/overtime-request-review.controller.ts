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
  type OvertimeRequestReviewPage,
  type RequestReviewQueueQuery,
} from '@dexa/contracts';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  OVERTIME_REQUEST_REVIEW_SERVICE,
  type IOvertimeRequestReviewService,
} from './overtime-request-review.service.interface.js';

// HR only, checked here as well as at the gateway. The reviewer is the token's account, which is compared with each
// requester so that HR cannot review their own request (APR-4).
@Controller('overtime-requests')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class OvertimeRequestReviewController {
  constructor(
    @Inject(OVERTIME_REQUEST_REVIEW_SERVICE)
    private readonly overtimeRequestReviews: IOvertimeRequestReviewService,
  ) {}

  @Get()
  listReviewQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(requestReviewQueueQuerySchema)) query: RequestReviewQueueQuery,
  ): Promise<OvertimeRequestReviewPage> {
    return this.overtimeRequestReviews.listReviewQueue(user.accountId, query);
  }
}
