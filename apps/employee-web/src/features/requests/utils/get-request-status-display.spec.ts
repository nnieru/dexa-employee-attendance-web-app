import { describe, expect, it } from 'vitest';
import { getRequestStatusDisplay } from './get-request-status-display.js';

describe('getRequestStatusDisplay', () => {
  it.each([
    { status: 'PENDING', text: 'Awaiting approval', tone: 'warning' },
    { status: 'APPROVED', text: 'Approved', tone: 'success' },
    { status: 'REJECTED', text: 'Rejected', tone: 'error' },
  ] as const)('should label $status as $text with the $tone tone', ({ status, text, tone }) => {
    expect(getRequestStatusDisplay(status)).toEqual({ text, tone });
  });
});
