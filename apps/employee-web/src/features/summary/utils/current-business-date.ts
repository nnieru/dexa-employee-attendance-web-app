import { toBusinessDate } from './business-date.js';
import type { BusinessDate } from '../types/summary-search.schema.js';

/**
 * The only read of the browser clock for the summary: today's WIB date. Tests fake it with
 * `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime`, so no component reads `new Date()` directly.
 */
export function getCurrentBusinessDate(): BusinessDate {
  return toBusinessDate(new Date());
}
