import type { UseFormRegister } from 'react-hook-form';
import { requestedCorrectionDayStatusSchema } from '@dexa/contracts';
import type { CorrectionRequestFormValues } from '../utils/correction-request-form.schema.js';
import { CORRECTION_OUTCOME_LEGEND, REQUESTED_OUTCOME_TEXT } from '../utils/requests-messages.js';

type CorrectionOutcomeRadioGroupProps = {
  register: UseFormRegister<CorrectionRequestFormValues>;
};

/** The requested outcome as native radio buttons in a fieldset. Each label is the whole 44px hit area. */
export function CorrectionOutcomeRadioGroup({ register }: CorrectionOutcomeRadioGroupProps) {
  return (
    <fieldset className="correction-outcome">
      <legend className="correction-outcome__legend">{CORRECTION_OUTCOME_LEGEND}</legend>
      {requestedCorrectionDayStatusSchema.options.map((outcome) => (
        <label key={outcome} className="correction-outcome__option">
          <input
            type="radio"
            value={outcome}
            className="correction-outcome__input"
            {...register('requestedDayStatus')}
          />
          <span>{REQUESTED_OUTCOME_TEXT[outcome]}</span>
        </label>
      ))}
    </fieldset>
  );
}
