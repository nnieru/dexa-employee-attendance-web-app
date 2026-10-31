import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
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
import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  NOTIFICATION_INBOX_CLIENT,
  type INotificationInboxClient,
} from './notification-inbox-client.interface.js';

// The global guards verify the token, the account, and the HR role before a handler runs, so an employee never reaches
// notification-service. The query and params are validated here and again by notification-service.
@Controller('notifications')
export class NotificationInboxController {
  constructor(
    @Inject(NOTIFICATION_INBOX_CLIENT) private readonly inbox: INotificationInboxClient,
  ) {}

  @Roles(Role.HR)
  @Get()
  listNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery,
  ): Promise<NotificationPage> {
    return this.inbox.listNotifications(user, query);
  }

  @Roles(Role.HR)
  @Get('unread-count')
  countUnread(@CurrentUser() user: AuthenticatedUser): Promise<NotificationUnreadCount> {
    return this.inbox.countUnread(user);
  }

  @Roles(Role.HR)
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(notificationIdParamSchema)) params: NotificationIdParam,
  ): Promise<Notification> {
    return this.inbox.markRead(user, params.id);
  }
}
