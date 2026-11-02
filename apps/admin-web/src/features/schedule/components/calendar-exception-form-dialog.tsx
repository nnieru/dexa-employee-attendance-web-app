import { useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Dialog, TextField } from '@dexa/ui';
import {
  createCalendarExceptionFormSchema,
  type CalendarExceptionFormValues,
} from '../types/calendar-exception-form.schema.js';
import type { BusinessDate } from '../utils/schedule-business-date.js';
import {
  ADD_DIALOG_DESCRIPTION,
  ADD_DIALOG_TITLE,
  ADD_SUBMIT_LABEL,
  CANCEL_LABEL,
  DATE_HINT,
  DATE_LABEL,
  DATE_REPLACE_HINT,
  DESCRIPTION_LABEL,
  EDIT_DIALOG_DESCRIPTION,
  EDIT_DIALOG_TITLE,
  EDIT_SUBMIT_LABEL,
  EXCEPTION_TYPE_LEGEND,
  HOLIDAY_HELP,
  SAVE_NOT_PREPARED_MESSAGE,
  SPECIAL_WORKING_DAY_HELP,
} from '../utils/calendar-exception-messages.js';
import { HOLIDAY_LABEL, SPECIAL_WORKING_DAY_LABEL } from '../utils/calendar-exception-types.js';
import {
  toCalendarExceptionSave,
  type CalendarExceptionSave,
} from '../utils/to-calendar-exception-save.js';

export type CalendarExceptionDialogMode = 'add' | 'edit';

type CalendarExceptionFormDialogProps = {
  mode: CalendarExceptionDialogMode;
  /** The values the form starts from. The dialog mounts when it opens, so a refetch never resets what HR typed. */
  defaultValues: Partial<CalendarExceptionFormValues>;
  /** Tomorrow in WIB. Earlier dates are refused on the client. */
  earliestEditableDate: BusinessDate;
  isSaving: boolean;
  /** A message from the failed save, shown as a general alert. */
  serverErrorMessage: string | undefined;
  onSave: (save: CalendarExceptionSave) => void;
  onClose: () => void;
};

/**
 * Adds or edits one calendar exception. The form validates and hands over a save; it sends nothing itself. The request
 * is built and parsed with the shared contract. A failure there is shown as an alert, never thrown past the form.
 */
export function CalendarExceptionFormDialog({
  mode,
  defaultValues,
  earliestEditableDate,
  isSaving,
  serverErrorMessage,
  onSave,
  onClose,
}: CalendarExceptionFormDialogProps) {
  const formId = useId();
  const [preparationError, setPreparationError] = useState<string | undefined>(undefined);
  const schema = useMemo(
    () => createCalendarExceptionFormSchema(earliestEditableDate),
    [earliestEditableDate],
  );
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<CalendarExceptionFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  const isEditMode = mode === 'edit';
  const alertMessage = preparationError ?? serverErrorMessage;

  function handleValidSubmit(values: CalendarExceptionFormValues) {
    const save = tryToCalendarExceptionSave(values);
    if (save === undefined) {
      setPreparationError(SAVE_NOT_PREPARED_MESSAGE);
      return;
    }
    setPreparationError(undefined);
    onSave(save);
  }

  return (
    <Dialog
      open
      title={isEditMode ? EDIT_DIALOG_TITLE : ADD_DIALOG_TITLE}
      description={isEditMode ? EDIT_DIALOG_DESCRIPTION : ADD_DIALOG_DESCRIPTION}
      isDismissible={!isSaving}
      onClose={onClose}
      showCloseButton={false}
      footer={
        <>
          <Button variant="secondary" disabled={isSaving} onClick={onClose}>
            {CANCEL_LABEL}
          </Button>
          <Button type="submit" form={formId} isLoading={isSaving}>
            {isEditMode ? EDIT_SUBMIT_LABEL : ADD_SUBMIT_LABEL}
          </Button>
        </>
      }
    >
      {alertMessage !== undefined && <Alert variant="error">{alertMessage}</Alert>}
      <form
        id={formId}
        className="calendar-exception-form"
        noValidate
        onSubmit={handleSubmit(handleValidSubmit)}
      >
        <TextField
          label={DATE_LABEL}
          type="date"
          min={earliestEditableDate}
          readOnly={isEditMode}
          autoComplete="off"
          hint={isEditMode ? undefined : `${DATE_HINT} ${DATE_REPLACE_HINT}`}
          error={errors.date?.message}
          {...register('date')}
        />
        <fieldset className="calendar-exception-form__types">
          <legend>{EXCEPTION_TYPE_LEGEND}</legend>
          {errors.exceptionType && (
            <p className="dexa-field__error">{errors.exceptionType.message}</p>
          )}
          <div className="calendar-exception-form__option">
            <label className="calendar-exception-form__choice">
              <input
                type="radio"
                value="holiday"
                aria-describedby="calendar-exception-holiday-help"
                {...register('exceptionType')}
              />
              <span>{HOLIDAY_LABEL}</span>
            </label>
            <p id="calendar-exception-holiday-help" className="calendar-exception-form__help">
              {HOLIDAY_HELP}
            </p>
          </div>
          <div className="calendar-exception-form__option">
            <label className="calendar-exception-form__choice">
              <input
                type="radio"
                value="specialWorkingDay"
                aria-describedby="calendar-exception-special-help"
                {...register('exceptionType')}
              />
              <span>{SPECIAL_WORKING_DAY_LABEL}</span>
            </label>
            <p id="calendar-exception-special-help" className="calendar-exception-form__help">
              {SPECIAL_WORKING_DAY_HELP}
            </p>
          </div>
        </fieldset>
        <TextField
          label={DESCRIPTION_LABEL}
          autoComplete="off"
          error={errors.description?.message}
          {...register('description')}
        />
      </form>
    </Dialog>
  );
}

/** The save for valid values, or undefined when the shared contract refuses them (the drift case the caller reports). */
function tryToCalendarExceptionSave(
  values: CalendarExceptionFormValues,
): CalendarExceptionSave | undefined {
  try {
    return toCalendarExceptionSave(values);
  } catch {
    return undefined;
  }
}
