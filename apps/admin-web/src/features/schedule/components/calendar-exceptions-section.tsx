import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_PAGE_SIZE,
  type WorkCalendarDate,
  type WorkCalendarDatePage,
} from '@dexa/contracts';
import {
  Alert,
  Button,
  DataTable,
  DateRangeFilter,
  useToast,
  type DataTableStatus,
} from '@dexa/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { useCalendarExceptions } from '../hooks/use-calendar-exceptions.js';
import { useDeleteCalendarException } from '../hooks/use-delete-calendar-exception.js';
import { useSaveCalendarException } from '../hooks/use-save-calendar-exception.js';
import {
  resolveCalendarExceptionSearch,
  type CalendarExceptionSearch,
} from '../types/calendar-exception-search.schema.js';
import type { CalendarExceptionFormValues } from '../types/calendar-exception-form.schema.js';
import {
  getCalendarExceptionRangeError,
  toCalendarExceptionQuery,
  type CalendarExceptionRange,
} from '../utils/calendar-exception-range.js';
import { getEarliestEditableExceptionDate } from '../utils/calendar-exception-dates.js';
import {
  ADD_EXCEPTION_LABEL,
  CALENDAR_LOAD_ERROR_MESSAGE,
  CALENDAR_SECTION_DESCRIPTION,
  CALENDAR_SECTION_TITLE,
  CALENDAR_TABLE_CAPTION,
  INVALID_RANGE_TABLE_MESSAGE,
  REMOVE_SUCCESS_MESSAGE,
  SAVE_SUCCESS_MESSAGE,
  getCalendarExceptionEmptyMessage,
  getCalendarExceptionErrorMessage,
} from '../utils/calendar-exception-messages.js';
import { toExceptionType } from '../utils/calendar-exception-types.js';
import type { CalendarExceptionSave } from '../utils/to-calendar-exception-save.js';
import type { BusinessDate } from '../utils/schedule-business-date.js';
import { createCalendarExceptionColumns } from './calendar-exception-columns.js';
import { CalendarExceptionFormDialog } from './calendar-exception-form-dialog.js';
import { CalendarExceptionRemoveDialog } from './calendar-exception-remove-dialog.js';

type CalendarExceptionsSectionProps = {
  search: CalendarExceptionSearch;
  /** Today in the company timezone. The route reads the clock, so this section stays a function of its props. */
  today: BusinessDate;
  onRangeSearch: (range: CalendarExceptionRange) => void;
  onPageChange: (page: number) => void;
};

type CalendarExceptionDialogState = { mode: 'add' } | { mode: 'edit'; exception: WorkCalendarDate };

const NO_ROWS: Array<WorkCalendarDate> = [];

function getCalendarExceptionRowId(exception: WorkCalendarDate): string {
  return exception.date;
}

/**
 * Calendar exceptions for a range, on the work schedule screen. The URL owns the range and the page. Add and
 * edit open a dialog holding a snapshot of the exception at open time, so a refetch does not reset the form.
 */
export function CalendarExceptionsSection({
  search,
  today,
  onRangeSearch,
  onPageChange,
}: CalendarExceptionsSectionProps) {
  const resolvedSearch = resolveCalendarExceptionSearch(search, today);
  const range: CalendarExceptionRange = { from: resolvedSearch.from, to: resolvedSearch.to };
  const urlRangeError = getCalendarExceptionRangeError(range);
  const isRangeValid = urlRangeError === undefined;
  const exceptionsQuery = useCalendarExceptions(
    toCalendarExceptionQuery(resolvedSearch),
    isRangeValid,
  );
  const saveMutation = useSaveCalendarException();
  const deleteMutation = useDeleteCalendarException();
  const { showToast } = useToast();
  const [dialogState, setDialogState] = useState<CalendarExceptionDialogState | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WorkCalendarDate | null>(null);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const earliestEditableDate = getEarliestEditableExceptionDate(today);
  const page = isRangeValid ? exceptionsQuery.data : undefined;
  const { reset: resetSave } = saveMutation;
  const { reset: resetDelete } = deleteMutation;

  const openAddDialog = useCallback(() => {
    resetSave();
    setDialogState({ mode: 'add' });
  }, [resetSave]);

  const openEditDialog = useCallback(
    (exception: WorkCalendarDate) => {
      resetSave();
      setDialogState({ mode: 'edit', exception });
    },
    [resetSave],
  );

  const openRemoveDialog = useCallback(
    (exception: WorkCalendarDate) => {
      resetDelete();
      setRemoveTarget(exception);
    },
    [resetDelete],
  );

  const columns = useMemo(
    () =>
      createCalendarExceptionColumns({
        today,
        onEdit: openEditDialog,
        onRemove: openRemoveDialog,
      }),
    [today, openEditDialog, openRemoveDialog],
  );

  function handleRangeSearch(draft: CalendarExceptionRange) {
    const draftError = getCalendarExceptionRangeError(draft);
    setSubmitError(draftError);
    if (draftError !== undefined) return;
    onRangeSearch(draft);
  }

  function handleSave(save: CalendarExceptionSave) {
    saveMutation.mutate(save, {
      onSuccess: () => {
        setDialogState(null);
        showToast({ variant: 'success', message: SAVE_SUCCESS_MESSAGE });
      },
    });
  }

  function handleConfirmRemove() {
    if (removeTarget === null) return;
    deleteMutation.mutate(removeTarget.date, {
      onSuccess: () => {
        setRemoveTarget(null);
        showToast({ variant: 'success', message: REMOVE_SUCCESS_MESSAGE });
      },
      // The failure is shown in the section, so the confirmation closes here.
      onError: () => setRemoveTarget(null),
    });
  }

  return (
    <section className="calendar-exceptions" aria-labelledby="calendar-exceptions-heading">
      <div className="calendar-exceptions__heading">
        <div>
          <h2 id="calendar-exceptions-heading">{CALENDAR_SECTION_TITLE}</h2>
          <p className="calendar-exceptions__description">{CALENDAR_SECTION_DESCRIPTION}</p>
        </div>
        <Button onClick={openAddDialog}>{ADD_EXCEPTION_LABEL}</Button>
      </div>
      {deleteMutation.isError && (
        <Alert variant="error">{getCalendarExceptionErrorMessage(deleteMutation.error)}</Alert>
      )}
      <DateRangeFilter
        value={range}
        today={today}
        error={submitError ?? urlRangeError}
        onSearch={handleRangeSearch}
        onReset={() => setSubmitError(undefined)}
      />
      <DataTable
        caption={CALENDAR_TABLE_CAPTION}
        columns={columns}
        data={page?.items ?? NO_ROWS}
        emptyMessage={
          isRangeValid ? getCalendarExceptionEmptyMessage(range) : INVALID_RANGE_TABLE_MESSAGE
        }
        getRowId={getCalendarExceptionRowId}
        pagination={{
          page: resolvedSearch.page,
          pageSize: DEFAULT_PAGE_SIZE,
          pageCount: page?.totalPages ?? 0,
          onPageChange,
        }}
        paginationSummary={page === undefined ? undefined : `Total: ${page.totalItems}`}
        status={getTableStatus(isRangeValid, exceptionsQuery)}
      />
      {dialogState !== null && (
        <CalendarExceptionFormDialog
          mode={dialogState.mode}
          defaultValues={toDefaultValues(dialogState, earliestEditableDate)}
          earliestEditableDate={earliestEditableDate}
          isSaving={saveMutation.isPending}
          serverErrorMessage={
            saveMutation.isError ? getCalendarExceptionErrorMessage(saveMutation.error) : undefined
          }
          onSave={handleSave}
          onClose={() => setDialogState(null)}
        />
      )}
      {removeTarget !== null && (
        <CalendarExceptionRemoveDialog
          exception={removeTarget}
          isBusy={deleteMutation.isPending}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={handleConfirmRemove}
        />
      )}
    </section>
  );
}

function toDefaultValues(
  dialogState: CalendarExceptionDialogState,
  earliestEditableDate: BusinessDate,
): Partial<CalendarExceptionFormValues> {
  if (dialogState.mode === 'add') {
    return { date: earliestEditableDate, description: '' };
  }
  return {
    date: dialogState.exception.date,
    exceptionType: toExceptionType(dialogState.exception.isWorkingDay),
    description: dialogState.exception.description ?? '',
  };
}

/** Maps the query state to the table state. An error wins over stale rows, so a failed reload is never hidden. */
function getTableStatus(
  isRangeValid: boolean,
  exceptionsQuery: UseQueryResult<WorkCalendarDatePage, Error>,
): DataTableStatus {
  if (!isRangeValid) return { kind: 'ready' };
  if (exceptionsQuery.isError) {
    return {
      kind: 'error',
      message: CALENDAR_LOAD_ERROR_MESSAGE,
      onRetry: () => void exceptionsQuery.refetch(),
    };
  }
  if (exceptionsQuery.isPending) return { kind: 'loading' };
  if (exceptionsQuery.isFetching) return { kind: 'refreshing' };
  return { kind: 'ready' };
}
