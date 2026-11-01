import { describe, expect, it } from 'vitest';
import {
  calculateReconnectDelayMilliseconds,
  isRefusedStatus,
} from './notification-stream.rules.js';

describe('calculateReconnectDelayMilliseconds', () => {
  it.each([
    [0, 1_000],
    [1, 2_000],
    [2, 4_000],
    [3, 8_000],
    [4, 16_000],
    [5, 30_000],
    [6, 30_000],
    [1_000, 30_000],
  ])('should wait %i failed attempts to %i milliseconds', (failedAttempts, expectedDelay) => {
    expect(calculateReconnectDelayMilliseconds(failedAttempts)).toBe(expectedDelay);
  });
});

describe('isRefusedStatus', () => {
  it.each([
    [401, true],
    [403, true],
    [200, false],
    [404, false],
    [429, false],
    [500, false],
    [503, false],
  ])('should treat status %i as refused: %s', (status, expectedRefused) => {
    expect(isRefusedStatus(status)).toBe(expectedRefused);
  });
});
