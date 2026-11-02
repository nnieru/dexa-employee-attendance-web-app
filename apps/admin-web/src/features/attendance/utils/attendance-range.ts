import { isSummaryRangeOrdered } from '@dexa/contracts';
import { z } from 'zod';
import type { BusinessDate } from './business-date.js';

export const INVALID_DATE_MESSAGE = 'Enter a valid From and To date.';
export const RANGE_ORDER_MESSAGE = 'From must not be after To.';

const businessDateSchema = z.iso.date();

export type AttendanceRange = {
  from: BusinessDate;
  to: BusinessDate;
};

/**
 * The message for a range that cannot be searched, or undefined when it can. The order rule is the
 * shared one from @dexa/contracts, so the browser refuses exactly what the API refuses.
 */
export function getAttendanceRangeError(range: AttendanceRange): string | undefined {
  if (!isBusinessDate(range.from) || !isBusinessDate(range.to)) return INVALID_DATE_MESSAGE;
  if (!isSummaryRangeOrdered(range.from, range.to)) return RANGE_ORDER_MESSAGE;
  return undefined;
}

function isBusinessDate(value: string): value is BusinessDate {
  return businessDateSchema.safeParse(value).success;
}
