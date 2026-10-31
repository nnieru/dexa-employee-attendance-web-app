import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../pagination/pagination.schema.js';
import { notificationSchema } from './notification.schema.js';

// Bounds the cursor the client sends back. A cursor is a short encoded sort key, so a longer value is refused before
// it is decoded.
export const NOTIFICATION_CURSOR_MAX_LENGTH = 512;

// The inbox is keyset-paginated, so there is no page number. The cursor is opaque to clients and is decoded only by
// notification-service, which checks its contents. Strict, so an unknown query key is refused rather than ignored.
export const notificationListQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(NOTIFICATION_CURSOR_MAX_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

// nextCursor is null on the last page. Items are newest first.
export const notificationPageSchema = z.strictObject({
  items: z.array(notificationSchema),
  nextCursor: z.string().min(1).nullable(),
});

export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const notificationUnreadCountSchema = z.strictObject({
  unreadCount: z.number().int().nonnegative(),
});

export type NotificationUnreadCount = z.infer<typeof notificationUnreadCountSchema>;

export const notificationIdParamSchema = z.strictObject({
  id: z.uuid(),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
