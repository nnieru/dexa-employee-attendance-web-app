import { archiveWithRetry } from './archive-with-retry.js';

const DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

// Records each pause instead of waiting, so the backoff sequence is asserted directly.
function recordingSleep(): {
  readonly pauses: number[];
  readonly sleep: (ms: number) => Promise<void>;
} {
  const pauses: number[] = [];
  return {
    pauses,
    sleep: (milliseconds: number) => {
      pauses.push(milliseconds);
      return Promise.resolve();
    },
  };
}

// Fails the first `failures` attempts with the error `buildError` makes, then succeeds, and counts every call.
function flakyAttempt(
  failures: number,
  buildError: () => Error = () => Object.assign(new Error('connection refused'), { code: '08006' }),
): { readonly calls: () => number; readonly attempt: () => Promise<void> } {
  let calls = 0;
  return {
    calls: () => calls,
    attempt: () => {
      calls += 1;
      if (calls <= failures) {
        return Promise.reject(buildError());
      }
      return Promise.resolve();
    },
  };
}

describe('archiveWithRetry', () => {
  it.each([
    {
      condition: 'the first attempt succeeds',
      failures: 0,
      expectedCalls: 1,
      expectedPauses: [],
      expectedKind: 'archived',
    },
    {
      condition: 'the third attempt succeeds after transient failures',
      failures: 2,
      expectedCalls: 3,
      expectedPauses: [1_000, 2_000],
      expectedKind: 'archived',
    },
    {
      condition: 'every one of the five attempts fails transiently',
      failures: 5,
      expectedCalls: 5,
      expectedPauses: [1_000, 2_000, 4_000, 8_000],
      expectedKind: 'failed',
    },
  ])(
    'should pause 1 s, 2 s, 4 s and 8 s between transient attempts when $condition',
    async ({ failures, expectedCalls, expectedPauses, expectedKind }) => {
      const sleeps = recordingSleep();
      const flaky = flakyAttempt(failures);

      const outcome = await archiveWithRetry(flaky.attempt, {
        delaysMs: DELAYS_MS,
        sleep: sleeps.sleep,
      });

      expect(outcome.kind).toBe(expectedKind);
      expect(flaky.calls()).toBe(expectedCalls);
      expect(sleeps.pauses).toEqual(expectedPauses);
    },
  );

  it('should give up at once with no pause when the first failure is permanent (23505)', async () => {
    const sleeps = recordingSleep();
    const flaky = flakyAttempt(Number.POSITIVE_INFINITY, () =>
      Object.assign(new Error('unique violation'), { code: '23505' }),
    );

    const outcome = await archiveWithRetry(flaky.attempt, {
      delaysMs: DELAYS_MS,
      sleep: sleeps.sleep,
    });

    expect(outcome.kind).toBe('failed');
    expect(flaky.calls()).toBe(1);
    expect(sleeps.pauses).toEqual([]);
  });

  it('should stop with no further pause when a later attempt fails permanently', async () => {
    const sleeps = recordingSleep();
    let calls = 0;
    const attempt = (): Promise<void> => {
      calls += 1;
      if (calls < 3) {
        return Promise.reject(Object.assign(new Error('connection refused'), { code: '08006' }));
      }
      return Promise.reject(Object.assign(new Error('data error'), { code: '22P02' }));
    };

    await archiveWithRetry(attempt, { delaysMs: DELAYS_MS, sleep: sleeps.sleep });

    expect(calls).toBe(3);
    expect(sleeps.pauses).toEqual([1_000, 2_000]);
  });

  it('should return the error of the last attempt when every attempt fails', async () => {
    const outcome = await archiveWithRetry(
      () => Promise.reject(Object.assign(new Error('final'), { code: '08006' })),
      { delaysMs: DELAYS_MS, sleep: recordingSleep().sleep },
    );

    expect(outcome).toEqual({ kind: 'failed', error: new Error('final') });
  });
});
