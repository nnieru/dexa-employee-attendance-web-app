import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import {
  ownRequestListQuerySchema,
  requestReviewQueueQuerySchema,
  Role,
  submitOvertimeRequestSchema,
  type OvertimeRequest,
  type OvertimeRequestPage,
  type OvertimeRequestReviewPage,
  type OwnRequestListQuery,
  type RequestReviewQueueQuery,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  OVERTIME_REQUEST_CLIENT,
  type IOvertimeRequestClient,
} from './overtime-request-client.interface.js';

// The body is strict here and again in attendance-service, so a client-supplied requester is refused at the edge.
// The requester is the verified token's account, forwarded through the internal client's onBehalfOf.
@Controller('overtime-requests')
export class OvertimeRequestController {
  constructor(
    @Inject(OVERTIME_REQUEST_CLIENT) private readonly overtimeRequests: IOvertimeRequestClient,
  ) {}

  @Roles(Role.EMPLOYEE, Role.HR)
  @Post()
  submitOvertime(
    @Body(new ZodValidationPipe(submitOvertimeRequestSchema)) request: SubmitOvertimeRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OvertimeRequest> {
    return this.overtimeRequests.submitOvertime(user, request);
  }

  // The requester is the verified token's account. The query is validated here and again by attendance-service.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me')
  listOwnRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ownRequestListQuerySchema)) query: OwnRequestListQuery,
  ): Promise<OvertimeRequestPage> {
    return this.overtimeRequests.listOwnRequests(user, query);
  }

  // HR only. The queue is read from attendance-service, which checks the role again and compares the requester with
  // the token's account for isOwnRequest.
  @Roles(Role.HR)
  @Get()
  listReviewQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(requestReviewQueueQuerySchema)) query: RequestReviewQueueQuery,
  ): Promise<OvertimeRequestReviewPage> {
    return this.overtimeRequests.listReviewQueue(user, query);
  }
}
