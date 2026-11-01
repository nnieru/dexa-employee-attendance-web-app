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
  submitCorrectionRequestSchema,
  type CorrectionRequest,
  type CorrectionRequestPage,
  type OwnRequestListQuery,
  type SubmitCorrectionRequest,
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
  CORRECTION_REQUEST_LIST_SERVICE,
  type ICorrectionRequestListService,
} from './correction-request-list.service.interface.js';
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
    @Inject(CORRECTION_REQUEST_LIST_SERVICE)
    private readonly correctionRequestLists: ICorrectionRequestListService,
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

  // The signed-in account's own requests of every status, newest first (APR-6). The query is strict, and the
  // requester comes only from the token.
  @Get('me')
  listOwnRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ownRequestListQuerySchema)) query: OwnRequestListQuery,
  ): Promise<CorrectionRequestPage> {
    return this.correctionRequestLists.listOwnRequests(user.accountId, query);
  }
}
