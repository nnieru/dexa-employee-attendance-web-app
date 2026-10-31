import { MAX_DELIVERIES } from '@dexa/messaging';
import { deriveAttemptCount, readDeliveryCount } from './delivery-count.rules.js';

describe('readDeliveryCount', () => {
  it.each([
    { condition: 'the headers are absent', headers: undefined },
    { condition: 'the headers carry neither counter', headers: { 'x-death': [] } },
    { condition: 'the counter is zero', headers: { 'x-acquired-count': 0 } },
    { condition: 'the counter is a string', headers: { 'x-acquired-count': '3' } },
    { condition: 'the counter is not whole', headers: { 'x-delivery-count': 1.5 } },
  ])('should return undefined when $condition', ({ headers }) => {
    expect(readDeliveryCount(headers)).toBeUndefined();
  });

  it.each([
    { condition: 'only x-acquired-count is set', headers: { 'x-acquired-count': 3 }, expected: 3 },
    { condition: 'only x-delivery-count is set', headers: { 'x-delivery-count': 2 }, expected: 2 },
    {
      condition: 'both counters are set',
      headers: { 'x-acquired-count': 3, 'x-delivery-count': 3 },
      expected: 3,
    },
    {
      condition: 'x-acquired-count is malformed and x-delivery-count is valid',
      headers: { 'x-acquired-count': 'many', 'x-delivery-count': 1 },
      expected: 1,
    },
  ])('should read the delivery count when $condition', ({ headers, expected }) => {
    expect(readDeliveryCount(headers)).toBe(expected);
  });
});

describe('deriveAttemptCount', () => {
  it.each([
    {
      condition: 'the counter is present, even for a delivery_limit failure',
      deliveryCount: 2,
      lastError: 'delivery_limit',
      expected: 2,
    },
    {
      condition: 'the counter is present for a rejected failure',
      deliveryCount: 1,
      lastError: 'rejected',
      expected: 1,
    },
    {
      condition: 'the counter is absent and the reason is delivery_limit',
      deliveryCount: undefined,
      lastError: 'delivery_limit',
      expected: MAX_DELIVERIES,
    },
    {
      condition: 'the counter is absent and the reason is rejected',
      deliveryCount: undefined,
      lastError: 'rejected',
      expected: 1,
    },
    {
      condition: 'the counter is absent and no failure is recorded',
      deliveryCount: undefined,
      lastError: 'unknown',
      expected: 1,
    },
  ])('should return $expected when $condition', ({ deliveryCount, lastError, expected }) => {
    expect(deriveAttemptCount({ deliveryCount, lastError })).toBe(expected);
  });
});
