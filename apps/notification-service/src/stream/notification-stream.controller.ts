import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import { Role } from '@dexa/contracts';
import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { NotificationStreamService } from './notification-stream.service.js';

// HR only, checked here as well as at the gateway. The guards run before this handler, so an employee token is
// refused before any header is written.
@Controller('notifications')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class NotificationStreamController {
  constructor(private readonly streams: NotificationStreamService) {}

  // The raw response is used because the stream stays open and carries comment frames, which a Nest return value
  // cannot send. Nothing is returned, so Nest does not end the response.
  @Get('stream')
  openStream(@CurrentUser() user: AuthenticatedUser, @Res() response: Response): void {
    this.streams.attach(user.accountId, response);
  }
}
