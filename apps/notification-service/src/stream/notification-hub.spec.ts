import { jest } from '@jest/globals';
import type { InsertedNotification } from '../ingestion/notification-writer.interface.js';
import { NotificationHub } from './notification-hub.js';

const RECIPIENT_A = '1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c';
const RECIPIENT_B = '3b4c5d6e-7f80-4912-8bcd-2e3f4a5b6c7d';

function insertedFor(recipientAccountId: string, id: string): InsertedNotification {
  return {
    id,
    eventType: 'employee.profile.updated',
    recipientAccountId,
    title: 'Budi Santoso updated: phone number',
    body: 'Changed fields: phone number.',
    data: { changedFields: ['phoneNumber'] },
    occurredAt: new Date('2026-10-30T02:05:00.000Z'),
    createdAt: new Date('2026-10-30T02:05:01.000Z'),
    readAt: null,
  };
}

describe('NotificationHub', () => {
  it('should deliver a row only to the listener of its recipient', () => {
    const hub = new NotificationHub();
    const listenerA = jest.fn();
    const listenerB = jest.fn();
    hub.subscribe(RECIPIENT_A, listenerA);
    hub.subscribe(RECIPIENT_B, listenerB);
    const rowForA = insertedFor(RECIPIENT_A, 'a-row');

    hub.publish([rowForA]);

    expect(listenerA).toHaveBeenCalledWith(rowForA);
    expect(listenerB).not.toHaveBeenCalled();
  });

  it('should stop delivering to a listener after its unsubscribe function runs', () => {
    const hub = new NotificationHub();
    const listener = jest.fn();
    const unsubscribe = hub.subscribe(RECIPIENT_A, listener);

    unsubscribe();
    hub.publish([insertedFor(RECIPIENT_A, 'a-row')]);

    expect(listener).not.toHaveBeenCalled();
  });

  it('should keep no subscription once every listener has unsubscribed', () => {
    const hub = new NotificationHub();
    const unsubscribeFirst = hub.subscribe(RECIPIENT_A, () => undefined);
    const unsubscribeSecond = hub.subscribe(RECIPIENT_A, () => undefined);

    unsubscribeFirst();
    expect(hub.subscriberCount()).toBe(1);
    unsubscribeSecond();
    unsubscribeSecond();

    expect(hub.subscriberCount()).toBe(0);
  });

  it('should still deliver to the other listeners when one listener throws', () => {
    const hub = new NotificationHub();
    const healthyListener = jest.fn();
    hub.subscribe(RECIPIENT_A, () => {
      throw new Error('A broken stream.');
    });
    hub.subscribe(RECIPIENT_A, healthyListener);

    expect(() => hub.publish([insertedFor(RECIPIENT_A, 'a-row')])).not.toThrow();
    expect(healthyListener).toHaveBeenCalledTimes(1);
  });
});
