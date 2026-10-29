import {
  decideDeliverySettlement,
  type DeliveryOutcome,
  type DeliverySettlement,
} from './delivery-settlement.rules.js';
import { NonRetryableMessageError } from './event-delivery.errors.js';

describe('decideDeliverySettlement', () => {
  it.each<{ condition: string; outcome: DeliveryOutcome; settlement: DeliverySettlement }>([
    { condition: 'the handler resolved', outcome: { kind: 'handled' }, settlement: 'ack' },
    {
      condition: 'the body is not an event message',
      outcome: { kind: 'invalid-envelope' },
      settlement: 'dead-letter',
    },
    {
      condition: 'the handler throws NonRetryableMessageError',
      outcome: {
        kind: 'handler-failed',
        error: new NonRetryableMessageError('payload rejected by validation'),
      },
      settlement: 'dead-letter',
    },
    {
      condition: 'the handler throws a transient error',
      outcome: { kind: 'handler-failed', error: new Error('database unavailable') },
      settlement: 'requeue',
    },
    {
      condition: 'the handler throws a value that is not an error',
      outcome: { kind: 'handler-failed', error: 'connection reset' },
      settlement: 'requeue',
    },
  ])('should return $settlement when $condition', ({ outcome, settlement }) => {
    expect(decideDeliverySettlement(outcome)).toBe(settlement);
  });
});
