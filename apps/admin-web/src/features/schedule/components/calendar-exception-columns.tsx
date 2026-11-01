import type { WorkCalendarDate } from '@dexa/contracts';
import { Button, StatusLabel, createDataTableColumnHelper } from '@dexa/ui';
import {
  getWeekdayLabel,
  isEditableCalendarExceptionDate,
} from '../utils/calendar-exception-dates.js';
import {
  REMOVE_EXCEPTION_LABEL_PREFIX,
  EDIT_EXCEPTION_LABEL_PREFIX,
  NO_DESCRIPTION_TEXT,
} from '../utils/calendar-exception-messages.js';
import {
  getCalendarExceptionTypeLabel,
  getCalendarExceptionTypeTone,
} from '../utils/calendar-exception-types.js';
import type { BusinessDate } from '../utils/schedule-business-date.js';

type CalendarExceptionColumnOptions = {
  /** Today in WIB. Only dates after it show edit and remove controls (PRD SCH-5). */
  today: BusinessDate;
  onEdit: (exception: WorkCalendarDate) => void;
  onRemove: (exception: WorkCalendarDate) => void;
};

/**
 * The list columns. A row for a past date or today has no action control at all, so the actions cell is empty
 * (PRD SCH-5). The columns are built by a factory because the action handlers belong to the section.
 */
export function createCalendarExceptionColumns({
  today,
  onEdit,
  onRemove,
}: CalendarExceptionColumnOptions) {
  const helper = createDataTableColumnHelper<WorkCalendarDate>();
  return helper.columns([
    helper.display({
      id: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <>
          <span className="calendar-exceptions__date">{row.original.date}</span>{' '}
          <span className="calendar-exceptions__weekday">{getWeekdayLabel(row.original.date)}</span>
        </>
      ),
    }),
    helper.display({
      id: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <StatusLabel tone={getCalendarExceptionTypeTone(row.original.isWorkingDay)}>
          {getCalendarExceptionTypeLabel(row.original.isWorkingDay)}
        </StatusLabel>
      ),
    }),
    helper.display({
      id: 'description',
      header: 'Description',
      cell: ({ row }) => row.original.description ?? NO_DESCRIPTION_TEXT,
    }),
    helper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        if (!isEditableCalendarExceptionDate(row.original.date, today)) return null;
        return (
          <div className="calendar-exceptions__row-actions">
            <Button
              variant="secondary"
              aria-label={`${EDIT_EXCEPTION_LABEL_PREFIX} ${row.original.date}`}
              onClick={() => onEdit(row.original)}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              aria-label={`${REMOVE_EXCEPTION_LABEL_PREFIX} ${row.original.date}`}
              onClick={() => onRemove(row.original)}
            >
              Remove
            </Button>
          </div>
        );
      },
    }),
  ]);
}
