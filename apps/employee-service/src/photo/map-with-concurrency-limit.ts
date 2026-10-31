/**
 * Applies `mapper` to every item with at most `limit` calls running at once. The results keep the order of `items`.
 * A rejected call rejects the whole result, so a mapper whose failures must not stop the others catches them itself.
 */
export async function mapWithConcurrencyLimit<TItem, TResult>(
  items: ReadonlyArray<TItem>,
  limit: number,
  mapper: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('The concurrency limit must be a positive integer.');
  }
  const results: TResult[] = new Array<TResult>(items.length);
  // One iterator is shared by every worker, so each item is taken by exactly one worker.
  const pendingEntries = items.entries();
  const runWorker = async (): Promise<void> => {
    for (const [index, item] of pendingEntries) {
      results[index] = await mapper(item);
    }
  };
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}
