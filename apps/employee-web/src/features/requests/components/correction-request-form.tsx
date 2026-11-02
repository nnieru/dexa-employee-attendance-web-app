import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { REQUEST_REASON_MAX_LENGTH, type CorrectionRequest } from '@dexa/contracts';
import { Alert, Button, Textarea, TextField } from '@dexa/ui';
import { useForm, useWatch } from 'react-hook-form';
import { useSubmitCorrectionRequest } from '../hooks/use-submit-correction-request.js';
import type { BusinessDate } from '../utils/business-time.js';
import { getCorrectionDateBounds } from '../utils/correction-date-window.js';
import {
  createCorrectionRequestFormResolver,
  toCorrectionRequestPayload,
  type CorrectionRequestFormValues,
} from '../utils/correction-request-form.schema.js';
import { mapCorrectionSubmitError } from '../utils/correction-submit-error.js';
import {
  CORRECTION_BUSINESS_DATE_HINT,
  CORRECTION_CANCEL_LABEL,
  CORRECTION_CLOCK_IN_HINT,
  CORRECTION_CLOCK_IN_LABEL,
  CORRECTION_CLOCK_OUT_HINT,
  CORRECTION_CLOCK_OUT_LABEL,
  CORRECTION_REASON_LABEL,
  CORRECTION_SUBMIT_LABEL,
  REQUEST_CONTRACT_MESSAGE,
} from '../utils/requests-messages.js';
import { CorrectionOutcomeRadioGroup } from './correction-outcome-radio-group.js';

type CorrectionRequestFormProps = {
  /** Today in WIB, read once by the page, so the window and the default date do not move while the form is open. */
  today: BusinessDate;
  initialBusinessDate: BusinessDate;
  onBusinessDateChange: (businessDate: BusinessDate) => void;
  onSubmitted: (request: CorrectionRequest) => void;
};

/**
 * One correction request, entered in WIB. Times are asked for only for a present day; a leave outcome
 * hides them and sends none. Field errors come from the rules here or from the server, and every entered value is kept
 * when a submission is refused.
 */
export function CorrectionRequestForm({
  today,
  initialBusinessDate,
  onBusinessDateChange,
  onSubmitted,
}: CorrectionRequestFormProps) {
  const bounds = getCorrectionDateBounds(today);
  const resolver = useMemo(() => createCorrectionRequestFormResolver(today), [today]);
  const [generalMessage, setGeneralMessage] = useState<string | null>(null);
  const { isPending, submit } = useSubmitCorrectionRequest();

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<CorrectionRequestFormValues>({
    resolver,
    defaultValues: {
      requestedDayStatus: 'PRESENT',
      businessDate: initialBusinessDate,
      clockInTime: '',
      clockOutTime: '',
      reason: '',
    },
  });

  const [requestedDayStatus, reason] = useWatch({
    control,
    name: ['requestedDayStatus', 'reason'],
  });
  const isPresent = requestedDayStatus === 'PRESENT';
  const reasonLength = reason.length;

  function showFailure(error: unknown) {
    const failure = mapCorrectionSubmitError(error);
    if (failure.kind === 'general') {
      setGeneralMessage(failure.message);
      return;
    }
    setError(failure.field, { type: 'server', message: failure.message });
  }

  function submitCorrectionForm(values: CorrectionRequestFormValues) {
    setGeneralMessage(null);
    const result = submit(toCorrectionRequestPayload(values), {
      onSubmitted,
      onFailed: showFailure,
    });
    if (result === 'refused') setGeneralMessage(REQUEST_CONTRACT_MESSAGE);
  }

  return (
    <form
      className="employee-request-form"
      noValidate
      onSubmit={handleSubmit(submitCorrectionForm)}
    >
      {generalMessage && <Alert variant="error">{generalMessage}</Alert>}
      <TextField
        label="Business date"
        type="date"
        min={bounds.earliest}
        max={bounds.latest}
        hint={CORRECTION_BUSINESS_DATE_HINT}
        error={errors.businessDate?.message}
        {...register('businessDate', {
          onChange: (event: ChangeEvent<HTMLInputElement>) =>
            onBusinessDateChange(event.target.value),
        })}
      />
      <CorrectionOutcomeRadioGroup register={register} />
      {isPresent && (
        <div className="employee-request-form__times">
          <TextField
            label={CORRECTION_CLOCK_IN_LABEL}
            type="time"
            hint={CORRECTION_CLOCK_IN_HINT}
            error={errors.clockInTime?.message}
            {...register('clockInTime')}
          />
          <TextField
            label={CORRECTION_CLOCK_OUT_LABEL}
            type="time"
            hint={CORRECTION_CLOCK_OUT_HINT}
            error={errors.clockOutTime?.message}
            {...register('clockOutTime')}
          />
        </div>
      )}
      <Textarea
        label={CORRECTION_REASON_LABEL}
        required
        rows={4}
        hint={`${reasonLength} of ${REQUEST_REASON_MAX_LENGTH} characters`}
        error={errors.reason?.message}
        {...register('reason')}
      />
      <div className="employee-request-form__actions">
        <Button type="submit" isLoading={isPending}>
          {CORRECTION_SUBMIT_LABEL}
        </Button>
        <Link to="/requests" className="dexa-button dexa-button--secondary">
          <span className="dexa-button__label">{CORRECTION_CANCEL_LABEL}</span>
        </Link>
      </div>
    </form>
  );
}
