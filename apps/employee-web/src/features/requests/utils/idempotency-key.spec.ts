import { describe, expect, it, vi } from 'vitest';
import {
  isSameRequestPayload,
  resolveAttemptIdempotencyKey,
  type OvertimeRequestPayload,
  type SubmittedAttempt,
} from './idempotency-key.js';

const PAYLOAD: OvertimeRequestPayload = {
  businessDate: '2026-11-02',
  startAt: '2026-11-02T11:30:00.000Z',
  endAt: '2026-11-02T14:00:00.000Z',
  reason: 'Month-end reporting',
};
const FIRST_KEY = '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c01';
const NEW_KEY = '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c02';
const LAST_ATTEMPT: SubmittedAttempt<OvertimeRequestPayload> = {
  idempotencyKey: FIRST_KEY,
  payload: PAYLOAD,
};

describe('resolveAttemptIdempotencyKey', () => {
  it('should make a new key when no attempt was sent yet', () => {
    const createKey = vi.fn(() => NEW_KEY);

    expect(resolveAttemptIdempotencyKey(null, PAYLOAD, createKey)).toBe(NEW_KEY);
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it('should reuse the last key without making one when the content is identical', () => {
    const createKey = vi.fn(() => NEW_KEY);

    expect(resolveAttemptIdempotencyKey(LAST_ATTEMPT, { ...PAYLOAD }, createKey)).toBe(FIRST_KEY);
    expect(createKey).not.toHaveBeenCalled();
  });

  it.each([
    ['the reason', { reason: 'Another reason' }],
    ['the start instant', { startAt: '2026-11-02T12:00:00.000Z' }],
    ['the end instant', { endAt: '2026-11-02T15:00:00.000Z' }],
    ['the business date', { businessDate: '2026-11-01' }],
  ])('should make a new key when %s changed since the last attempt', (_field, change) => {
    const createKey = vi.fn(() => NEW_KEY);

    expect(resolveAttemptIdempotencyKey(LAST_ATTEMPT, { ...PAYLOAD, ...change }, createKey)).toBe(
      NEW_KEY,
    );
    expect(createKey).toHaveBeenCalledTimes(1);
  });
});

describe('isSameRequestPayload', () => {
  it('should be false when a key is present in one payload and absent in the other', () => {
    const withClockOut = { businessDate: '2026-11-02', clockOutAt: '2026-11-02T10:00:00.000Z' };
    const withoutClockOut = { businessDate: '2026-11-02' };

    expect(isSameRequestPayload(withClockOut, withoutClockOut)).toBe(false);
    expect(isSameRequestPayload(withoutClockOut, withClockOut)).toBe(false);
  });

  it('should be true when every key and value is equal, whatever the key order', () => {
    expect(isSameRequestPayload({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true);
  });
});
