import { jest } from '@jest/globals';
import { mapWithConcurrencyLimit } from './map-with-concurrency-limit.js';

// Resolves after the other pending calls have had a turn, so overlapping calls are observable.
async function yieldTurns(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

describe('mapWithConcurrencyLimit', () => {
  it('should return the results in the order of the items when calls finish out of order', async () => {
    const results = await mapWithConcurrencyLimit([3, 1, 2], 3, async (delay) => {
      await yieldTurns(delay * 2);
      return delay * 10;
    });

    expect(results).toEqual([30, 10, 20]);
  });

  it.each([
    { condition: 'there are more items than the limit', itemCount: 10, limit: 4, expectedPeak: 4 },
    { condition: 'there are fewer items than the limit', itemCount: 2, limit: 4, expectedPeak: 2 },
    { condition: 'the limit is one', itemCount: 5, limit: 1, expectedPeak: 1 },
  ])(
    'should never run more than the limit at once when $condition',
    async ({ itemCount, limit, expectedPeak }) => {
      let running = 0;
      let peak = 0;
      const items = Array.from({ length: itemCount }, (_, index) => index);

      await mapWithConcurrencyLimit(items, limit, async (item) => {
        running += 1;
        peak = Math.max(peak, running);
        await yieldTurns(3);
        running -= 1;
        return item;
      });

      expect(peak).toBe(expectedPeak);
    },
  );

  it('should call the mapper once for each item when the list is longer than the limit', async () => {
    const seen: number[] = [];
    const items = Array.from({ length: 9 }, (_, index) => index);

    await mapWithConcurrencyLimit(items, 2, async (item) => {
      seen.push(item);
      await yieldTurns(1);
    });

    expect(seen.sort((first, second) => first - second)).toEqual(items);
  });

  it('should return an empty list without calling the mapper when there are no items', async () => {
    const mapper = jest.fn(async (item: number) => item);

    expect(await mapWithConcurrencyLimit([], 4, mapper)).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'should reject the call when the limit is %s',
    async (limit) => {
      await expect(mapWithConcurrencyLimit([1], limit, async (item) => item)).rejects.toThrow(
        RangeError,
      );
    },
  );
});
