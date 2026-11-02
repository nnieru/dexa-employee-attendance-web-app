import { resolveOutboxSettings } from './outbox-settings.js';

const DATABASE_TOKEN = Symbol('TEST_DATABASE');

describe('resolveOutboxSettings', () => {
  it('should use a 500 ms poll and 7 days of retention when no option is given', () => {
    expect(resolveOutboxSettings({ databaseToken: DATABASE_TOKEN })).toEqual({
      pollIntervalMs: 500,
      retentionDays: 7,
    });
  });

  it('should keep every configured value when each option is given', () => {
    expect(
      resolveOutboxSettings({
        databaseToken: DATABASE_TOKEN,
        pollIntervalMs: 250,
        retentionDays: 3,
      }),
    ).toEqual({ pollIntervalMs: 250, retentionDays: 3 });
  });

  it.each([
    {
      condition: 'the poll interval is zero',
      options: { databaseToken: DATABASE_TOKEN, pollIntervalMs: 0 },
    },
    {
      condition: 'the retention is fractional',
      options: { databaseToken: DATABASE_TOKEN, retentionDays: 1.5 },
    },
    {
      condition: 'the poll interval is not a number',
      options: { databaseToken: DATABASE_TOKEN, pollIntervalMs: Number.NaN },
    },
  ])('should throw a RangeError when $condition', ({ options }) => {
    expect(() => resolveOutboxSettings(options)).toThrow(RangeError);
  });
});
