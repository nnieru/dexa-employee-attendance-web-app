import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { REQUEST_REASON_MAX_LENGTH, type OvertimeRequest } from '@dexa/contracts';
import { Alert, Button, Textarea, TextField } from '@dexa/ui';
import { useForm, useWatch } from 'react-hook-form';
import { useSubmitOvertimeRequest } from '../hooks/use-submit-overtime-request.js';
import { getCurrentBusinessDate } from '../utils/current-business-date.js';
import { getEndTimeHint } from '../utils/overtime-interval.js';
import {
  createOvertimeRequestFormResolver,
  getOvertimeBusinessDateBounds,
  toOvertimeRequestPayload,
  type OvertimeRequestFormValues,
} from '../utils/overtime-request-form.schema.js';
import { mapOvertimeSubmitError } from '../utils/overtime-submit-error.js';
import {
  OVERTIME_BUSINESS_DATE_HINT,
  OVERTIME_CANCEL_LABEL,
  OVERTIME_END_TIME_HELP_TEXT,
  OVERTIME_REASON_LABEL,
  OVERTIME_REQUEST_CONTRACT_MESSAGE,
  OVERTIME_START_TIME_HINT,
  OVERTIME_SUBMIT_LABEL,
} from '../utils/requests-messages.js';

type OvertimeRequestFormProps = {
  onSubmitted: (request: OvertimeRequest) => void;
};

const EMPTY_TIME = '';

/**
 * One overtime request, entered in WIB. "Today" is read once per form session, so the date limits and
 * the default date stay the same while the employee is on the form. Field errors come from the rules here or from the
 * server, and every entered value is kept when a submission is refused.
 */
export function OvertimeRequestForm({ onSubmitted }: OvertimeRequestFormProps) {
  const [today] = useState(getCurrentBusinessDate);
  const bounds = getOvertimeBusinessDateBounds(today);
  const resolver = useMemo(() => createOvertimeRequestFormResolver(today), [today]);
  const [generalMessage, setGeneralMessage] = useState<string | null>(null);
  const { isPending, submit } = useSubmitOvertimeRequest();

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<OvertimeRequestFormValues>({
    resolver,
    defaultValues: { businessDate: today, startTime: EMPTY_TIME, endTime: EMPTY_TIME, reason: '' },
  });

  const [startTime, endTime, reason] = useWatch({
    control,
    name: ['startTime', 'endTime', 'reason'],
  });
  const reasonLength = reason.length;

  function showFailure(error: unknown) {
    const failure = mapOvertimeSubmitError(error);
    if (failure.kind === 'general') {
      setGeneralMessage(failure.message);
      return;
    }
    setError(failure.field, { type: 'server', message: failure.message });
  }

  function submitOvertimeForm(values: OvertimeRequestFormValues) {
    setGeneralMessage(null);
    const result = submit(toOvertimeRequestPayload(values), {
      onSubmitted,
      onFailed: showFailure,
    });
    if (result === 'refused') setGeneralMessage(OVERTIME_REQUEST_CONTRACT_MESSAGE);
  }

  return (
    <form className="employee-request-form" noValidate onSubmit={handleSubmit(submitOvertimeForm)}>
      <TextField
        label="Business date"
        type="date"
        min={bounds.earliest}
        max={bounds.latest}
        hint={OVERTIME_BUSINESS_DATE_HINT}
        error={errors.businessDate?.message}
        {...register('businessDate')}
      />
      <div className="employee-request-form__times">
        <TextField
          label="Start time (WIB)"
          type="time"
          hint={OVERTIME_START_TIME_HINT}
          error={errors.startTime?.message}
          {...register('startTime')}
        />
        <TextField
          label="End time (WIB)"
          type="time"
          hint={getEndTimeHint(startTime, endTime, OVERTIME_END_TIME_HELP_TEXT)}
          error={errors.endTime?.message}
          {...register('endTime')}
        />
      </div>
      <Textarea
        label={OVERTIME_REASON_LABEL}
        required
        rows={4}
        hint={`${reasonLength} of ${REQUEST_REASON_MAX_LENGTH} characters`}
        error={errors.reason?.message}
        {...register('reason')}
      />
      {generalMessage && <Alert variant="error">{generalMessage}</Alert>}
      <div className="employee-request-form__actions">
        <Button type="submit" isLoading={isPending}>
          {OVERTIME_SUBMIT_LABEL}
        </Button>
        <Link to="/requests" className="dexa-button dexa-button--secondary">
          <span className="dexa-button__label">{OVERTIME_CANCEL_LABEL}</span>
        </Link>
      </div>
    </form>
  );
}
