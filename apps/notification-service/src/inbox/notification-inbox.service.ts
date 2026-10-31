import { CLOCK, NotFoundError, ValidationError, type IClock } from '@dexa/common';
import {
  ErrorCode,
  type Notification,
  type NotificationListQuery,
  type NotificationPage,
  type NotificationUnreadCount,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { decodeInboxCursor } from './notification-inbox-cursor.rules.js';
import { toNotificationItem, toNotificationPage } from './notification-inbox-item.rules.js';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from './notification-inbox.repository.interface.js';
import type { INotificationInboxService } from './notification-inbox.service.interface.js';

const INVALID_CURSOR_MESSAGE = 'The cursor is not valid.';
const NOTIFICATION_NOT_FOUND_MESSAGE = 'The notification was not found.';
// One row more than a page, so the page knows whether a next page exists.
const LOOKAHEAD_ROWS = 1;

@Injectable()
export class NotificationInboxService implements INotificationInboxService {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async listNotifications(
    recipientAccountId: string,
    query: NotificationListQuery,
  ): Promise<NotificationPage> {
    const after = query.cursor === undefined ? undefined : decodeInboxCursor(query.cursor);
    if (query.cursor !== undefined && after === undefined) {
      throw new ValidationError(ErrorCode.VALIDATION_FAILED, INVALID_CURSOR_MESSAGE);
    }
    const records = await this.inbox.findPage({
      recipientAccountId,
      after,
      limit: query.limit + LOOKAHEAD_ROWS,
    });
    return toNotificationPage(records, query.limit);
  }

  async countUnread(recipientAccountId: string): Promise<NotificationUnreadCount> {
    return { unreadCount: await this.inbox.countUnread(recipientAccountId) };
  }

  // The read time comes from the injected clock (never the client). A repeat call returns the stored first read_at.
  async markRead(recipientAccountId: string, notificationId: string): Promise<Notification> {
    const record = await this.inbox.markRead({
      recipientAccountId,
      notificationId,
      readAt: this.clock.now(),
    });
    // The same answer for an unknown ID and for another recipient's row, so the response never reveals that a row exists.
    if (record === undefined) {
      throw new NotFoundError(ErrorCode.NOT_FOUND, NOTIFICATION_NOT_FOUND_MESSAGE);
    }
    return toNotificationItem(record);
  }
}
