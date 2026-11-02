import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  Role,
  type Notification,
  type NotificationIdParam,
  type NotificationListQuery,
  type NotificationPage,
  type NotificationUnreadCount,
} from '@dexa/contracts';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from './zod-validation.pipe.js';
import {
  NOTIFICATION_INBOX_SERVICE,
  type INotificationInboxService,
} from './notification-inbox.service.interface.js';

// HR only, checked here as well as at the gateway. The recipient is always the token's account, so the
// request never names whose inbox it reads.
@Controller('notifications')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class NotificationInboxController {
  constructor(
    @Inject(NOTIFICATION_INBOX_SERVICE) private readonly inbox: INotificationInboxService,
  ) {}

  @Get()
  listNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery,
  ): Promise<NotificationPage> {
    return this.inbox.listNotifications(user.accountId, query);
  }

  @Get('unread-count')
  countUnread(@CurrentUser() user: AuthenticatedUser): Promise<NotificationUnreadCount> {
    return this.inbox.countUnread(user.accountId);
  }

  // Answers 200, not Nest's default 201, because the request changes no new resource. Repeating it is safe.
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(notificationIdParamSchema)) params: NotificationIdParam,
  ): Promise<Notification> {
    return this.inbox.markRead(user.accountId, params.id);
  }
}
