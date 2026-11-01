import { toBusinessDate, type BusinessDate } from './business-time.js';

/**
 * The only read of the browser clock for the overtime form: today's WIB date. Tests fake it with
 * `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime`, the same way the summary feature does.
 */
export function getCurrentBusinessDate(): BusinessDate {
  return toBusinessDate(new Date());
}
