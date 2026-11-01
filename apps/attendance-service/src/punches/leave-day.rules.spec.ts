import { isLeaveDay } from './leave-day.rules.js';

describe('isLeaveDay', () => {
  it.each([
    { dayStatusCode: 'SICK_LEAVE', expected: true },
    { dayStatusCode: 'LEAVE', expected: true },
    { dayStatusCode: 'PRESENT', expected: false },
    { dayStatusCode: 'PENDING', expected: false },
    { dayStatusCode: 'DAY_OFF', expected: false },
    { dayStatusCode: 'NOT_ATTEND', expected: false },
    { dayStatusCode: 'leave', expected: false },
  ])('should return $expected for the day status $dayStatusCode', ({ dayStatusCode, expected }) => {
    expect(isLeaveDay(dayStatusCode)).toBe(expected);
  });
});
