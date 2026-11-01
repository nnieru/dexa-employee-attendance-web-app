import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE } from '@dexa/contracts';
import {
  getNextPageCursors,
  getPreviousPageCursors,
  resolveNotificationInboxPaging,
  toNotificationListQuery,
} from './notification-inbox-paging.js';

describe('resolveNotificationInboxPaging', () => {
  it.each([
    ['no cursors in the URL', undefined, 1, []],
    ['an empty list of cursors', [], 1, []],
    ['one cursor, which starts page 2', ['c2'], 2, ['c2']],
    ['two cursors, which start page 3', ['c2', 'c3'], 3, ['c2', 'c3']],
  ])('should number the page from the cursors when %s', (_label, cursors, pageNumber, expected) => {
    expect(resolveNotificationInboxPaging({ cursors })).toEqual({
      pageNumber,
      cursors: expected,
    });
  });
});

describe('toNotificationListQuery', () => {
  it('should send only the limit on the first page', () => {
    expect(toNotificationListQuery({ pageNumber: 1, cursors: [] })).toEqual({
      limit: DEFAULT_PAGE_SIZE,
    });
  });

  it('should send the last cursor as the start of the current page', () => {
    expect(toNotificationListQuery({ pageNumber: 3, cursors: ['c2', 'c3'] })).toEqual({
      cursor: 'c3',
      limit: DEFAULT_PAGE_SIZE,
    });
  });
});

describe('next and previous cursors', () => {
  it('should append the next page cursor when moving forward', () => {
    expect(getNextPageCursors({ pageNumber: 1, cursors: [] }, 'c2')).toEqual(['c2']);
    expect(getNextPageCursors({ pageNumber: 2, cursors: ['c2'] }, 'c3')).toEqual(['c2', 'c3']);
  });

  it('should drop the last cursor when moving back', () => {
    expect(getPreviousPageCursors({ pageNumber: 3, cursors: ['c2', 'c3'] })).toEqual(['c2']);
    expect(getPreviousPageCursors({ pageNumber: 2, cursors: ['c2'] })).toEqual([]);
  });
});
