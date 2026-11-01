import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import {
  approveOvertimeRequestSchema,
  ownRequestListQuerySchema,
  rejectOvertimeRequestSchema,
  requestIdSchema,
  requestReviewQueueQuerySchema,
  Role,
  submitOvertimeRequestSchema,
  type ApproveOvertimeRequest,
  type OvertimeRequest,
  type OvertimeRequestPage,
  type OvertimeRequestReviewItem,
  type OvertimeRequestReviewPage,
  type OwnRequestListQuery,
  type RejectOvertimeRequest,
  type RequestReviewQueueQuery,
  type SubmitOvertimeRequest,
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

  // HR only. The same review item as the queue, so the detail screen shows the current values and isOwnRequest.
  @Roles(Role.HR)
  @Get(':id')
  getReviewRequest(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OvertimeRequestReviewItem> {
    return this.overtimeRequests.getReviewRequest(user, requestId);
  }

  // HR only. The gateway checks the role, and attendance-service checks it again and refuses a reviewer who is the
  // requester (APR-4). The reviewer is the token's account; the body carries only the reason.
  @Roles(Role.HR)
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveOvertime(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(approveOvertimeRequestSchema)) body: ApproveOvertimeRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OvertimeRequest> {
    return this.overtimeRequests.approveOvertime(user, requestId, body);
  }

  @Roles(Role.HR)
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  rejectOvertime(
    @Param('id', new ZodValidationPipe(requestIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(rejectOvertimeRequestSchema)) body: RejectOvertimeRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OvertimeRequest> {
    return this.overtimeRequests.rejectOvertime(user, requestId, body);
  }
}
