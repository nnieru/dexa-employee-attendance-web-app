import { describe, expect, it } from 'vitest';
import { CHECK_IN_LABEL, CHECK_OUT_LABEL, DAY_STATUS_LABEL } from './current-record-labels.js';

describe('DAY_STATUS_LABEL', () => {
  it.each([
    ['PENDING', 'Pending'],
    ['PRESENT', 'Present'],
    ['NOT_ATTEND', 'Absent'],
    ['SICK_LEAVE', 'Sick leave'],
    ['LEAVE', 'Leave'],
    ['DAY_OFF', 'Day off'],
  ] as const)('should label the day status %s as %s', (status, text) => {
    expect(DAY_STATUS_LABEL[status].text).toBe(text);
  });
});

describe('CHECK_IN_LABEL', () => {
  it.each([
    ['ON_TIME_CHECKIN', 'On-time clock-in'],
    ['LATE_CHECKIN', 'Late clock-in'],
    ['PENDING_CHECKIN', 'Not recorded yet'],
    ['CHECKIN_NOT_REQUIRED', 'Not required'],
  ] as const)('should label the check-in status %s as %s', (status, text) => {
    expect(CHECK_IN_LABEL[status].text).toBe(text);
  });
});

describe('CHECK_OUT_LABEL', () => {
  it.each([
    ['EARLY_CHECKOUT', 'Early clock-out'],
    ['PENDING_CHECKOUT', 'Not recorded yet'],
    ['CHECKOUT_NOT_REQUIRED', 'Not required'],
  ] as const)('should label the check-out status %s as %s', (status, text) => {
    expect(CHECK_OUT_LABEL[status].text).toBe(text);
  });

  it('should give the same timing word a meaning of its own at check-out', () => {
    expect(CHECK_IN_LABEL.LATE_CHECKIN.tone).toBe('warning');
    expect(CHECK_OUT_LABEL.LATE_CHECKOUT.tone).toBe('neutral');
  });
});
