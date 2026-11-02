import { z } from 'zod';
import { createPageSchema, paginationQuerySchema } from '../pagination/pagination.schema.js';

// work_calendar_dates.description is varchar(255).
export const WORK_CALENDAR_DATE_DESCRIPTION_MAX_LENGTH = 255;

// One company calendar exception. description is null when HR gave none.
export const workCalendarDateSchema = z.object({
  date: z.iso.date(),
  isWorkingDay: z.boolean(),
  description: z.string().nullable(),
});

export type WorkCalendarDate = z.infer<typeof workCalendarDateSchema>;

export const workCalendarDatePageSchema = createPageSchema(workCalendarDateSchema);

export type WorkCalendarDatePage = z.infer<typeof workCalendarDatePageSchema>;

// Both bounds are required, so every list names the range it reads. Any range is allowed. YYYY-MM-DD dates
// order the same way as the calendar days they name, so a string comparison is a date comparison. Strict, so an
// unknown query parameter is refused rather than ignored.
export const workCalendarDateListQuerySchema = paginationQuerySchema
  .extend({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .superRefine((query, context) => {
    if (query.from <= query.to) return;
    context.addIssue({ code: 'custom', path: ['from'], message: 'must not be after to' });
  });

export type WorkCalendarDateListQuery = z.infer<typeof workCalendarDateListQuerySchema>;

// The business date in a route, such as PUT /work-calendar-dates/:date.
export const workCalendarDateParamSchema = z.iso.date();

// Strict, so a client cannot send the date (the route names it) or any other field. A missing description stores
// none, so a PUT without one clears the description the date had. A blank description is refused, because the table
// refuses it too.
export const workCalendarDateRequestSchema = z.strictObject({
  isWorkingDay: z.boolean(),
  description: z.string().trim().min(1).max(WORK_CALENDAR_DATE_DESCRIPTION_MAX_LENGTH).optional(),
});

export type WorkCalendarDateRequest = z.infer<typeof workCalendarDateRequestSchema>;
