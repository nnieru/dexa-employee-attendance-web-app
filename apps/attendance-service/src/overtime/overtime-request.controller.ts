import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  Role,
  submitOvertimeRequestSchema,
  type OvertimeRequest,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import { Body, Controller, HttpStatus, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
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
  ) {}

  // A new request answers 201. An identical retry answers 200 with the request that the first submission saved (APR-5).
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
}
