import { describe, expect, it } from 'vitest';
import { getRequestsEmptyMessage } from './requests-messages.js';

describe('getRequestsEmptyMessage', () => {
  it.each([
    {
      tab: 'overtime',
      status: undefined,
      expected: 'You have no overtime requests yet.',
    },
    {
      tab: 'corrections',
      status: undefined,
      expected: 'You have no correction requests yet.',
    },
    {
      tab: 'overtime',
      status: 'APPROVED',
      expected: 'No overtime requests have the status Approved. Choose All to see every status.',
    },
    {
      tab: 'corrections',
      status: 'PENDING',
      expected:
        'No correction requests have the status Awaiting approval. Choose All to see every status.',
    },
  ] as const)(
    'should name the type and the filter for $tab with $status',
    ({ tab, status, expected }) => {
      expect(getRequestsEmptyMessage(tab, status)).toBe(expected);
    },
  );
});
