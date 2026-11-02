import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  ownRequestListQuerySchema,
  Role,
  submitOvertimeRequestSchema,
  type OvertimeRequest,
  type OvertimeRequestPage,
  type OwnRequestListQuery,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  OVERTIME_REQUEST_LIST_SERVICE,
  type IOvertimeRequestListService,
} from './overtime-request-list.service.interface.js';
import {
  OVERTIME_REQUEST_SERVICE,
  type IOvertimeRequestService,
} from './overtime-request.service.interface.js';

// The identity comes only from the verified token. The body is strict, so a requester or a status sent by the client is refused.
@Controller('overtime-requests')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE, Role.HR)
export class OvertimeRequestController {
  constructor(
    @Inject(OVERTIME_REQUEST_SERVICE) private readonly overtimeRequests: IOvertimeRequestService,
    @Inject(OVERTIME_REQUEST_LIST_SERVICE)
    private readonly overtimeRequestLists: IOvertimeRequestListService,
  ) {}

  // A new request answers 201. An identical retry answers 200 with the request that the first submission saved.
  @Post()
  async submit(
    @Body(new ZodValidationPipe(submitOvertimeRequestSchema)) request: SubmitOvertimeRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OvertimeRequest> {
    const result = await this.overtimeRequests.submit(user.accountId, request);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.request;
  }

  // The signed-in account's own requests of every status, newest first. The query is strict, and the
  // requester comes only from the token.
  @Get('me')
  listOwnRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ownRequestListQuerySchema)) query: OwnRequestListQuery,
  ): Promise<OvertimeRequestPage> {
    return this.overtimeRequestLists.listOwnRequests(user.accountId, query);
  }
}
