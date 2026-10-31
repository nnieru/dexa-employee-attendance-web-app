import {
  settleDeadLetterDelivery,
  type DeliverySettlementInput,
} from './dead-letter-delivery.handler.js';

const DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

function failureWithCode(code: string): Error {
  return Object.assign(new Error('driver failure'), { code });
}

// Builds the settlement input with recording fakes for the archive write, the parking publish, the settlement and
// the pauses between retries.
function settlementInput(options: { readonly archiveError?: Error; readonly parkError?: Error }): {
  readonly input: DeliverySettlementInput;
  readonly calls: string[];
  readonly pauses: number[];
} {
  const calls: string[] = [];
  const pauses: number[] = [];
  const input: DeliverySettlementInput = {
    sourceQueue: 'audit.profile-changes',
    messageLabel: 'message-1',
    archive: () => {
      calls.push('archive');
      return options.archiveError === undefined
        ? Promise.resolve()
        : Promise.reject(options.archiveError);
    },
    park: () => {
      calls.push('park');
      return options.parkError === undefined
        ? Promise.resolve()
        : Promise.reject(options.parkError);
    },
    settlement: {
      ack: () => calls.push('ack'),
      requeue: () => calls.push('requeue'),
    },
    retry: {
      delaysMs: DELAYS_MS,
      sleep: (milliseconds: number) => {
        pauses.push(milliseconds);
        return Promise.resolve();
      },
    },
  };
  return { input, calls, pauses };
}

const TRANSIENT_ATTEMPTS = ['archive', 'archive', 'archive', 'archive', 'archive'];

describe('settleDeadLetterDelivery', () => {
  it.each([
    {
      condition: 'the archive write succeeds',
      options: {},
      expectedOutcome: 'archived',
      expectedCalls: ['archive', 'ack'],
      expectedPauses: [],
    },
    {
      condition: 'the archive fails with a connection error (08006) on every attempt',
      options: { archiveError: failureWithCode('08006') },
      expectedOutcome: 'requeued',
      expectedCalls: [...TRANSIENT_ATTEMPTS, 'requeue'],
      expectedPauses: DELAYS_MS,
    },
    {
      condition: 'the archive fails with no code on every attempt',
      options: { archiveError: new Error('Connection terminated unexpectedly') },
      expectedOutcome: 'requeued',
      expectedCalls: [...TRANSIENT_ATTEMPTS, 'requeue'],
      expectedPauses: DELAYS_MS,
    },
    {
      condition: 'the archive fails with a unique violation (23505)',
      options: { archiveError: failureWithCode('23505') },
      expectedOutcome: 'parked',
      expectedCalls: ['archive', 'park', 'ack'],
      expectedPauses: [],
    },
    {
      condition: 'the archive fails with a syntax error (42601)',
      options: { archiveError: failureWithCode('42601') },
      expectedOutcome: 'parked',
      expectedCalls: ['archive', 'park', 'ack'],
      expectedPauses: [],
    },
    {
      condition: 'the archive fails with a unique violation and the parking publish fails',
      options: { archiveError: failureWithCode('23505'), parkError: new Error('channel closed') },
      expectedOutcome: 'requeued',
      expectedCalls: ['archive', 'park', 'requeue'],
      expectedPauses: [],
    },
    {
      condition: 'the archive fails transiently and the parking publish would fail',
      options: { archiveError: failureWithCode('08006'), parkError: new Error('channel closed') },
      expectedOutcome: 'requeued',
      expectedCalls: [...TRANSIENT_ATTEMPTS, 'requeue'],
      expectedPauses: DELAYS_MS,
    },
  ])(
    'should settle the delivery as $expectedOutcome when $condition',
    async ({ options, expectedOutcome, expectedCalls, expectedPauses }) => {
      const { input, calls, pauses } = settlementInput(options);

      const outcome = await settleDeadLetterDelivery(input);

      expect(outcome).toBe(expectedOutcome);
      expect(calls).toEqual(expectedCalls);
      expect(pauses).toEqual(expectedPauses);
    },
  );

  it('should never acknowledge a transient failure, so the message stays in the dead-letter queue', async () => {
    const { input, calls } = settlementInput({ archiveError: failureWithCode('08006') });

    await settleDeadLetterDelivery(input);

    expect(calls).not.toContain('ack');
    expect(calls).not.toContain('park');
  });
});
