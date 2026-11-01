import { DEFAULT_PAGE_SIZE, type NotificationListQuery } from '@dexa/contracts';
import type { NotificationInboxSearch } from '../types/notification-inbox-search.schema.js';

export const FIRST_PAGE_NUMBER = 1;

export type NotificationInboxPaging = {
  /** One-based page number shown to the user. */
  pageNumber: number;
  /** Cursors of the pages before this one, in order. Empty on the first page. */
  cursors: ReadonlyArray<string>;
};

export function resolveNotificationInboxPaging(
  search: NotificationInboxSearch,
): NotificationInboxPaging {
  const cursors = search.cursors ?? [];
  return { pageNumber: cursors.length + FIRST_PAGE_NUMBER, cursors };
}

/** The request for the page that starts after the last entry of `cursors`. The limit is fixed, so it stays out of the URL. */
export function toNotificationListQuery(paging: NotificationInboxPaging): NotificationListQuery {
  const cursor = paging.cursors.at(-1);
  if (cursor === undefined) return { limit: DEFAULT_PAGE_SIZE };
  return { cursor, limit: DEFAULT_PAGE_SIZE };
}

export function getNextPageCursors(
  paging: NotificationInboxPaging,
  nextCursor: string,
): ReadonlyArray<string> {
  return [...paging.cursors, nextCursor];
}

export function getPreviousPageCursors(paging: NotificationInboxPaging): ReadonlyArray<string> {
  return paging.cursors.slice(0, -1);
}
