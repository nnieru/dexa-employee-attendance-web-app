import { z } from 'zod';
import { getMonthStartBusinessDate } from '../utils/business-date.js';

/** A calendar date as YYYY-MM-DD in the company timezone. */
export type BusinessDate = string;

const FIRST_PAGE = 1;

const businessDateSchema = z.iso.date();

/**
 * The summary state in the URL. A missing or unusable value takes its default, so a stale or
 * hand-edited link still opens the summary. An out-of-order range is kept: the page reports it, so the employee
 * sees why nothing loaded. The defaults depend on today, so today is passed in: the schema is a pure function of
 * its input, and the clock is read once, in the route.
 */
export function createSummarySearchSchema(today: BusinessDate) {
  return z.object({
    from: businessDateSchema.catch(getMonthStartBusinessDate(today)),
    to: businessDateSchema.catch(today),
    page: z.coerce.number().int().min(FIRST_PAGE).catch(FIRST_PAGE),
  });
}

export type SummarySearch = z.infer<ReturnType<typeof createSummarySearchSchema>>;
