import { toBusinessDate, type BusinessDate } from './schedule-business-date.js';

/**
 * The only read of the browser clock on this screen: today's WIB date. The route passes it down, so the page stays a
 * function of its props. Tests fake it with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime`.
 */
export function getCurrentBusinessDate(): BusinessDate {
  return toBusinessDate(new Date());
}
