import { describe, expect, it } from 'vitest';
import { getNextRequestTab } from './get-next-request-tab.js';

describe('getNextRequestTab', () => {
  it.each([
    { currentTab: 'overtime', key: 'ArrowRight', expected: 'corrections' },
    { currentTab: 'corrections', key: 'ArrowRight', expected: 'overtime' },
    { currentTab: 'overtime', key: 'ArrowLeft', expected: 'corrections' },
    { currentTab: 'corrections', key: 'ArrowLeft', expected: 'overtime' },
    { currentTab: 'corrections', key: 'Home', expected: 'overtime' },
    { currentTab: 'overtime', key: 'End', expected: 'corrections' },
    { currentTab: 'overtime', key: 'Enter', expected: undefined },
    { currentTab: 'corrections', key: 'Tab', expected: undefined },
  ] as const)(
    'should give $expected when $currentTab tab receives $key',
    ({ currentTab, key, expected }) => {
      expect(getNextRequestTab(currentTab, key)).toBe(expected);
    },
  );
});
