import { useId, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, TextField } from '@dexa/ui';
import {
  createWorkScheduleFormSchema,
  type WorkScheduleFormValues,
} from '../types/work-schedule-form.schema.js';
import type { BusinessDate } from '../utils/schedule-business-date.js';
import {
  EARLY_CHECKOUT_GRACE_HINT,
  EARLY_CHECKOUT_GRACE_LABEL,
  EFFECTIVE_FROM_HINT,
  EFFECTIVE_FROM_LABEL,
  END_TIME_LABEL,
  LATE_CHECKIN_GRACE_HINT,
  LATE_CHECKIN_GRACE_LABEL,
  LATE_CHECKOUT_GRACE_HINT,
  LATE_CHECKOUT_GRACE_LABEL,
  START_TIME_LABEL,
  WORKING_DAYS_LEGEND,
} from '../utils/work-schedule-messages.js';
import { WORKING_WEEKDAY_OPTIONS } from '../utils/work-schedule-weekdays.js';

type WorkScheduleFormProps = {
  /** The values the form starts from. The editor changes the key when they change, so the form restarts with them. */
  defaultValues: WorkScheduleFormValues;
  /** Tomorrow in WIB. Earlier dates are refused on the client (SCH-4). */
  earliestEffectiveFrom: BusinessDate;
  isBusy: boolean;
  submitLabel: string;
  onValidSubmit: (values: WorkScheduleFormValues) => void;
};

/**
 * The fields of one version. It validates and hands over the values; it sends nothing. The editor decides whether a
 * valid submit opens the confirmation.
 */
export function WorkScheduleForm({
  defaultValues,
  earliestEffectiveFrom,
  isBusy,
  submitLabel,
  onValidSubmit,
}: WorkScheduleFormProps) {
  const weekdayErrorId = useId();
  const schema = useMemo(
    () => createWorkScheduleFormSchema(earliestEffectiveFrom),
    [earliestEffectiveFrom],
  );
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<WorkScheduleFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const weekdayError = errors.workingWeekdays?.message;

  return (
    <form className="work-schedule-form" noValidate onSubmit={handleSubmit(onValidSubmit)}>
      <fieldset
        className="work-schedule-form__weekdays"
        aria-describedby={weekdayError ? weekdayErrorId : undefined}
      >
        <legend>{WORKING_DAYS_LEGEND}</legend>
        <div className="work-schedule-form__weekday-options">
          {WORKING_WEEKDAY_OPTIONS.map((option) => (
            <label key={option.value} className="work-schedule-form__weekday">
              <input type="checkbox" value={option.value} {...register('workingWeekdays')} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {weekdayError && (
          <p id={weekdayErrorId} className="dexa-field__error">
            {weekdayError}
          </p>
        )}
      </fieldset>
      <div className="work-schedule-form__row">
        <TextField
          label={START_TIME_LABEL}
          type="time"
          autoComplete="off"
          error={errors.startTime?.message}
          {...register('startTime')}
        />
        <TextField
          label={END_TIME_LABEL}
          type="time"
          autoComplete="off"
          error={errors.endTime?.message}
          {...register('endTime')}
        />
      </div>
      <div className="work-schedule-form__row">
        <TextField
          label={LATE_CHECKIN_GRACE_LABEL}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          autoComplete="off"
          hint={LATE_CHECKIN_GRACE_HINT}
          error={errors.lateCheckinGraceMinutes?.message}
          {...register('lateCheckinGraceMinutes')}
        />
        <TextField
          label={EARLY_CHECKOUT_GRACE_LABEL}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          autoComplete="off"
          hint={EARLY_CHECKOUT_GRACE_HINT}
          error={errors.earlyCheckoutGraceMinutes?.message}
          {...register('earlyCheckoutGraceMinutes')}
        />
        <TextField
          label={LATE_CHECKOUT_GRACE_LABEL}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          autoComplete="off"
          hint={LATE_CHECKOUT_GRACE_HINT}
          error={errors.lateCheckoutGraceMinutes?.message}
          {...register('lateCheckoutGraceMinutes')}
        />
      </div>
      <TextField
        label={EFFECTIVE_FROM_LABEL}
        type="date"
        min={earliestEffectiveFrom}
        autoComplete="off"
        hint={EFFECTIVE_FROM_HINT}
        error={errors.effectiveFrom?.message}
        {...register('effectiveFrom')}
      />
      <div className="work-schedule-form__actions">
        <Button type="submit" isLoading={isBusy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
