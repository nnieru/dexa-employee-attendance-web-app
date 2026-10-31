import type { InsertedNotification } from '../ingestion/notification-writer.interface.js';
import { HEARTBEAT_FRAME, formatNotificationFrame } from './sse-frame.rules.js';

const INSERTED: InsertedNotification = {
  id: '3f6a1c2e-8b9d-4e7f-a0b1-c2d3e4f5a6b7',
  eventType: 'account.password.changed',
  recipientAccountId: '1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c',
  title: 'Ada Lovelace changed their password',
  body: 'Changed fields: password.',
  data: { changedFields: ['password'] },
  occurredAt: new Date('2026-10-30T02:05:00.000Z'),
  createdAt: new Date('2026-10-30T02:05:01.000Z'),
  readAt: null,
};

// Reads the data line back out of one frame, so the test checks what a browser parses.
function dataOf(frame: string): unknown {
  const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(dataLine?.slice('data: '.length) ?? 'null') as unknown;
}

describe('formatNotificationFrame', () => {
  it('should name the event notification and end the frame with a blank line', () => {
    const frame = formatNotificationFrame(INSERTED);

    expect(frame.startsWith('event: notification\ndata: ')).toBe(true);
    expect(frame.endsWith('\n\n')).toBe(true);
  });

  it('should carry the notification as camelCase JSON with the read time null', () => {
    const frame = formatNotificationFrame(INSERTED);

    expect(dataOf(frame)).toEqual({
      id: INSERTED.id,
      eventType: 'account.password.changed',
      title: 'Ada Lovelace changed their password',
      body: 'Changed fields: password.',
      data: { changedFields: ['password'] },
      occurredAt: '2026-10-30T02:05:00.000Z',
      createdAt: '2026-10-30T02:05:01.000Z',
      readAt: null,
    });
  });

  it('should not carry the recipient account in the frame', () => {
    const frame = formatNotificationFrame(INSERTED);

    expect(frame).not.toContain(INSERTED.recipientAccountId);
  });

  it('should refuse a row that does not match the contract instead of sending it', () => {
    expect(() =>
      formatNotificationFrame({ ...INSERTED, eventType: 'attendance.checked_in.v1' }),
    ).toThrow();
  });
});

describe('HEARTBEAT_FRAME', () => {
  it('should be a comment frame, which EventSource clients ignore', () => {
    expect(HEARTBEAT_FRAME).toBe(': heartbeat\n\n');
  });
});
