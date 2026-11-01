import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import {
  Role,
  submitOvertimeRequestSchema,
  type OvertimeRequest,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import { Body, Controller, Inject, Post } from '@nestjs/common';
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
}
