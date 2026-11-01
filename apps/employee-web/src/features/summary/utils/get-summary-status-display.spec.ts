import { attendanceDayStatusSchema } from '@dexa/contracts';
import { describe, expect, it } from 'vitest';
import {
  getSummaryCheckInStatusDisplay,
  getSummaryCheckOutStatusDisplay,
  getSummaryDayStatusDisplay,
} from './get-summary-status-display.js';

describe('getSummaryDayStatusDisplay', () => {
  it.each([
    { status: 'PENDING', text: 'Pending', tone: 'neutral' },
    { status: 'PRESENT', text: 'Present', tone: 'success' },
    { status: 'NOT_ATTEND', text: 'Absent', tone: 'error' },
    { status: 'SICK_LEAVE', text: 'Sick leave', tone: 'info' },
    { status: 'LEAVE', text: 'Leave', tone: 'info' },
    { status: 'DAY_OFF', text: 'Day off', tone: 'neutral' },
  ] as const)('should label $status as $text with a $tone tone', ({ status, text, tone }) => {
    expect(getSummaryDayStatusDisplay(status)).toEqual({ text, tone });
  });

  it('should have a label for every stored day status', () => {
    for (const status of attendanceDayStatusSchema.options) {
      expect(getSummaryDayStatusDisplay(status).text).not.toBe('');
    }
  });
});

describe('leave-day timing labels', () => {
  it('should show Not required for the check-in and check-out a leave day stores', () => {
    expect(getSummaryCheckInStatusDisplay('CHECKIN_NOT_REQUIRED').text).toBe('Not required');
    expect(getSummaryCheckOutStatusDisplay('CHECKOUT_NOT_REQUIRED').text).toBe('Not required');
  });
});
