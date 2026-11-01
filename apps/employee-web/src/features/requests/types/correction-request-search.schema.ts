import { z } from 'zod';
import type { BusinessDate } from '../utils/business-time.js';
import { isSelectableCorrectionDate } from '../utils/correction-date-window.js';

/**
 * The correction form's URL state (PRD COR-1). `date` pre-fills the business date, for example from a History row. An
 * unusable value, or one outside the window, is dropped, so the form opens on today instead of refusing the page.
 * Today is passed in, so the schema is a pure function of its input.
 */
export function createCorrectionRequestSearchSchema(today: BusinessDate) {
  return z.object({
    date: z
      .string()
      .refine((value) => isSelectableCorrectionDate(value, today))
      .optional()
      .catch(undefined),
  });
}

export type CorrectionRequestSearch = z.infer<
  ReturnType<typeof createCorrectionRequestSearchSchema>
>;
