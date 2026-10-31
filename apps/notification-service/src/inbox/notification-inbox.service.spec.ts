import { NotFoundError, ValidationError, type IClock } from '@dexa/common';
import { ErrorCode, type NotificationListQuery } from '@dexa/contracts';
import { decodeInboxCursor, encodeInboxCursor } from './notification-inbox-cursor.rules.js';
import type {
  INotificationInboxRepository,
  MarkNotificationReadCriteria,
  NotificationInboxRecord,
  NotificationPageCriteria,
} from './notification-inbox.repository.interface.js';
import { NotificationInboxService } from './notification-inbox.service.js';

const HR_ACCOUNT = '1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c';
const OTHER_HR_ACCOUNT = '3b4c5d6e-7f80-4912-8bcd-2e3f4a5b6c7d';
const NOW = new Date('2026-10-31T09:00:00.000Z');

function recordOf(
  id: string,
  createdAt: Date,
  recipientAccountId: string,
  readAt: Date | null = null,
): NotificationInboxRecord & { readonly recipientAccountId: string } {
  return {
    id,
    recipientAccountId,
    eventType: 'employee.profile.updated',
    title: 'Budi Santoso updated: phone number',
    body: 'Changed fields: phone number.',
    data: { changedFields: ['phoneNumber'] },
    occurredAt: createdAt,
    createdAt,
    readAt,
  };
}

// Behaves like the table: rows of other recipients are invisible, newest first by (createdAt, id), and the cursor
// continues strictly after its row.
class InMemoryNotificationInbox implements INotificationInboxRepository {
  constructor(private rows: ReadonlyArray<ReturnType<typeof recordOf>>) {}

  findPage(criteria: NotificationPageCriteria): Promise<NotificationInboxRecord[]> {
    const ordered = this.rows
      .filter((row) => row.recipientAccountId === criteria.recipientAccountId)
      .filter((row) => isAfterCursor(row, criteria.after))
      .sort(compareNewestFirst);
    return Promise.resolve(ordered.slice(0, criteria.limit));
  }

  countUnread(recipientAccountId: string): Promise<number> {
    return Promise.resolve(
      this.rows.filter(
        (row) => row.recipientAccountId === recipientAccountId && row.readAt === null,
      ).length,
    );
  }

  markRead(criteria: MarkNotificationReadCriteria): Promise<NotificationInboxRecord | undefined> {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === criteria.notificationId &&
        candidate.recipientAccountId === criteria.recipientAccountId,
    );
    if (row === undefined) return Promise.resolve(undefined);
    if (row.readAt === null) {
      this.rows = this.rows.map((candidate) =>
        candidate === row ? { ...candidate, readAt: criteria.readAt } : candidate,
      );
    }
    return Promise.resolve(this.rows.find((candidate) => candidate.id === row.id));
  }
}

function isAfterCursor(
  row: NotificationInboxRecord,
  after: { readonly createdAt: Date; readonly id: string } | undefined,
): boolean {
  if (after === undefined) return true;
  if (row.createdAt.getTime() !== after.createdAt.getTime()) {
    return row.createdAt.getTime() < after.createdAt.getTime();
  }
  return row.id < after.id;
}

function compareNewestFirst(left: NotificationInboxRecord, right: NotificationInboxRecord): number {
  if (left.createdAt.getTime() !== right.createdAt.getTime()) {
    return right.createdAt.getTime() - left.createdAt.getTime();
  }
  return right.id.localeCompare(left.id);
}

function fixedClock(now: Date): IClock {
  return { now: () => now };
}

function queryOf(overrides: Partial<NotificationListQuery> = {}): NotificationListQuery {
  return { limit: 2, ...overrides };
}

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';
const ID_C = '00000000-0000-4000-8000-00000000000c';
const ID_D = '00000000-0000-4000-8000-00000000000d';
const ID_E = '00000000-0000-4000-8000-00000000000e';

describe('NotificationInboxService.listNotifications', () => {
  it('should return the recipient rows newest first and a next cursor when another row follows', async () => {
    const older = new Date('2026-10-30T02:00:00.000Z');
    const newer = new Date('2026-10-30T03:00:00.000Z');
    const inbox = new InMemoryNotificationInbox([
      recordOf(ID_A, older, HR_ACCOUNT),
      recordOf(ID_B, newer, HR_ACCOUNT),
      recordOf(ID_C, newer, OTHER_HR_ACCOUNT),
      recordOf(ID_D, newer, HR_ACCOUNT),
    ]);
    const service = new NotificationInboxService(inbox, fixedClock(NOW));

    const page = await service.listNotifications(HR_ACCOUNT, queryOf());

    expect(page.items.map((item) => item.id)).toEqual([ID_D, ID_B]);
    expect(page.nextCursor).toBe(encodeInboxCursor({ createdAt: newer, id: ID_B }));
  });

  it('should return a null next cursor on the last page', async () => {
    const createdAt = new Date('2026-10-30T02:00:00.000Z');
    const inbox = new InMemoryNotificationInbox([recordOf(ID_A, createdAt, HR_ACCOUNT)]);
    const service = new NotificationInboxService(inbox, fixedClock(NOW));

    const page = await service.listNotifications(HR_ACCOUNT, queryOf());

    expect(page.items.map((item) => item.id)).toEqual([ID_A]);
    expect(page.nextCursor).toBeNull();
  });

  it('should walk every page once when the cursor from each page is sent back', async () => {
    const createdAt = new Date('2026-10-30T02:00:00.000Z');
    const inbox = new InMemoryNotificationInbox([
      recordOf(ID_A, createdAt, HR_ACCOUNT),
      recordOf(ID_B, createdAt, HR_ACCOUNT),
      recordOf(ID_C, createdAt, HR_ACCOUNT),
      recordOf(ID_D, createdAt, HR_ACCOUNT),
      recordOf(ID_E, new Date('2026-10-29T02:00:00.000Z'), HR_ACCOUNT),
    ]);
    const service = new NotificationInboxService(inbox, fixedClock(NOW));
    const seenIds: string[] = [];
    let cursor: string | undefined;

    for (;;) {
      const page = await service.listNotifications(HR_ACCOUNT, queryOf({ cursor }));
      seenIds.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    expect(seenIds).toEqual([ID_D, ID_C, ID_B, ID_A, ID_E]);
  });

  it.each([
    { condition: 'the cursor is not a cursor', cursor: 'not-a-cursor!' },
    {
      condition: 'the cursor names a row that is not a valid sort key',
      cursor: Buffer.from(JSON.stringify({ createdAt: 'x', id: ID_A }), 'utf8').toString(
        'base64url',
      ),
    },
  ])('should refuse the request with VALIDATION_FAILED when $condition', async ({ cursor }) => {
    const service = new NotificationInboxService(
      new InMemoryNotificationInbox([]),
      fixedClock(NOW),
    );

    const failure = await service
      .listNotifications(HR_ACCOUNT, queryOf({ cursor }))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('should not query the repository when the cursor is refused', async () => {
    let queries = 0;
    const inbox: INotificationInboxRepository = {
      findPage: () => {
        queries += 1;
        return Promise.resolve([]);
      },
      countUnread: () => Promise.resolve(0),
      markRead: () => Promise.resolve(undefined),
    };
    const service = new NotificationInboxService(inbox, fixedClock(NOW));

    await expect(
      service.listNotifications(HR_ACCOUNT, queryOf({ cursor: 'not-a-cursor!' })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(queries).toBe(0);
  });

  it('should decode the cursor it issued to the same sort key', () => {
    const createdAt = new Date('2026-10-30T02:00:00.000Z');
    const cursor = encodeInboxCursor({ createdAt, id: ID_A });

    expect(decodeInboxCursor(cursor)).toEqual({ createdAt, id: ID_A });
  });
});

describe('NotificationInboxService.countUnread', () => {
  it('should count only the unread rows of the recipient', async () => {
    const createdAt = new Date('2026-10-30T02:00:00.000Z');
    const inbox = new InMemoryNotificationInbox([
      recordOf(ID_A, createdAt, HR_ACCOUNT),
      recordOf(ID_B, createdAt, HR_ACCOUNT, new Date('2026-10-30T03:00:00.000Z')),
      recordOf(ID_C, createdAt, OTHER_HR_ACCOUNT),
    ]);
    const service = new NotificationInboxService(inbox, fixedClock(NOW));

    await expect(service.countUnread(HR_ACCOUNT)).resolves.toEqual({ unreadCount: 1 });
  });
});

describe('NotificationInboxService.markRead', () => {
  it('should stamp the read time from the clock and return the notification', async () => {
    const createdAt = new Date('2026-10-30T02:00:00.000Z');
    const inbox = new InMemoryNotificationInbox([recordOf(ID_A, createdAt, HR_ACCOUNT)]);
    const service = new NotificationInboxService(inbox, fixedClock(NOW));

    const notification = await service.markRead(HR_ACCOUNT, ID_A);

    expect(notification).toMatchObject({ id: ID_A, readAt: NOW.toISOString() });
  });

  it('should keep the first read time when the notification is marked again', async () => {
    const createdAt = new Date('2026-10-30T02:00:00.000Z');
    const firstRead = new Date('2026-10-31T09:00:00.000Z');
    const inbox = new InMemoryNotificationInbox([recordOf(ID_A, createdAt, HR_ACCOUNT)]);
    await new NotificationInboxService(inbox, fixedClock(firstRead)).markRead(HR_ACCOUNT, ID_A);

    const again = await new NotificationInboxService(
      inbox,
      fixedClock(new Date('2026-10-31T10:00:00.000Z')),
    ).markRead(HR_ACCOUNT, ID_A);

    expect(again.readAt).toBe(firstRead.toISOString());
  });

  it.each([
    {
      condition: 'the notification belongs to another recipient',
      seededRecipient: OTHER_HR_ACCOUNT,
      requestedId: ID_A,
    },
    {
      condition: 'no notification has the ID',
      seededRecipient: OTHER_HR_ACCOUNT,
      requestedId: ID_E,
    },
  ])('should throw NotFoundError when $condition', async ({ seededRecipient, requestedId }) => {
    const createdAt = new Date('2026-10-30T02:00:00.000Z');
    const inbox = new InMemoryNotificationInbox([recordOf(ID_A, createdAt, seededRecipient)]);
    const service = new NotificationInboxService(inbox, fixedClock(NOW));

    const failure = await service
      .markRead(HR_ACCOUNT, requestedId)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NotFoundError);
    expect((failure as NotFoundError).code).toBe(ErrorCode.NOT_FOUND);
  });
});
