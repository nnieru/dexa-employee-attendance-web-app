import type { BusinessDate } from '@dexa/common';
import type { WorkCalendarDate } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, lte, type SQL } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import { workCalendarDates, type WorkCalendarDateRow } from '../infrastructure/db/schema.js';
import type {
  IWorkCalendarDateReader,
  IWorkCalendarDateWriter,
  NewWorkCalendarDate,
  WorkCalendarDateCriteria,
  WorkCalendarDateRecordPage,
} from './work-calendar-date.repository.interface.js';

// Ordered by the primary key (business_date), which also serves the range condition.
@Injectable()
export class WorkCalendarDateRepository
  implements IWorkCalendarDateReader, IWorkCalendarDateWriter
{
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findDatePage(criteria: WorkCalendarDateCriteria): Promise<WorkCalendarDateRecordPage> {
    const condition = buildRangeCondition(criteria);
    try {
      const rows = await this.database.db
        .select()
        .from(workCalendarDates)
        .where(condition)
        .orderBy(asc(workCalendarDates.businessDate))
        .limit(criteria.pageSize)
        .offset((criteria.page - 1) * criteria.pageSize);
      const [totals] = await this.database.db
        .select({ total: count() })
        .from(workCalendarDates)
        .where(condition);
      return { dates: rows.map(toWorkCalendarDate), totalItems: totals?.total ?? 0 };
    } catch (error: unknown) {
      throw wrapStorageError(error, 'Could not read the calendar dates.');
    }
  }

  // ON CONFLICT on the primary key makes the upsert one statement, so two saves for one date cannot both insert.
  // The set clause names the same values as the insert, so the stored row is exactly what HR sent (PUT semantics).
  async upsertDate(values: NewWorkCalendarDate): Promise<WorkCalendarDate> {
    try {
      const [row] = await this.database.db
        .insert(workCalendarDates)
        .values({
          businessDate: values.date,
          isWorkingDay: values.isWorkingDay,
          description: values.description,
        })
        .onConflictDoUpdate({
          target: workCalendarDates.businessDate,
          set: { isWorkingDay: values.isWorkingDay, description: values.description },
        })
        .returning();
      if (row === undefined)
        throw new Error('The calendar date was not returned after it was saved.');
      return toWorkCalendarDate(row);
    } catch (error: unknown) {
      throw wrapStorageError(error, 'Could not save the calendar date.');
    }
  }

  async deleteDate(date: BusinessDate): Promise<boolean> {
    try {
      const rows = await this.database.db
        .delete(workCalendarDates)
        .where(eq(workCalendarDates.businessDate, date))
        .returning({ businessDate: workCalendarDates.businessDate });
      return rows.length > 0;
    } catch (error: unknown) {
      throw wrapStorageError(error, 'Could not delete the calendar date.');
    }
  }
}

function buildRangeCondition(criteria: WorkCalendarDateCriteria): SQL | undefined {
  return and(
    gte(workCalendarDates.businessDate, criteria.from),
    lte(workCalendarDates.businessDate, criteria.to),
  );
}

function toWorkCalendarDate(row: WorkCalendarDateRow): WorkCalendarDate {
  return {
    date: row.businessDate,
    isWorkingDay: row.isWorkingDay,
    description: row.description,
  };
}
