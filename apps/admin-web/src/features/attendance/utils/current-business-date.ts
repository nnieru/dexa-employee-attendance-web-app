import { toBusinessDate, type BusinessDate } from './business-date.js';

/**
 * The only read of the browser clock on this screen: today's WIB date. Tests fake it with
 * `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime`, so no component reads `new Date()` directly.
 */
export function getCurrentBusinessDate(): BusinessDate {
  return toBusinessDate(new Date());
}
