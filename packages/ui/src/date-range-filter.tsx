import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Button } from './button.js';
import { TextField } from './text-field.js';
import {
  DATE_RANGE_PRESETS,
  calculateDateRangePreset,
  type DatePresetPeriod,
  type DateRange,
} from './date-range-presets.js';

export type DateRangeFilterProps = {
  /** The range the app has applied, for example read from the URL search params. */
  value: DateRange;
  /** Today as YYYY-MM-DD in the company timezone. The presets end on this date. */
  today: string;
  /** Validation message from the app, shown next to To. Validation itself is not done here. */
  error?: ReactNode;
  /** Receives the From and To values as entered when the user presses Search. */
  onSearch: (range: DateRange) => void;
  /** Called when the user presses Reset. The app restores its default range through `value`. */
  onReset: () => void;
};

/**
 * Edits a date range and submits it on Search. Presets only fill the fields; the user still
 * presses Search. Unsubmitted edits are kept until `value` changes to a different range.
 */
export function DateRangeFilter({ value, today, error, onSearch, onReset }: DateRangeFilterProps) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);

  // Adjusts state during render instead of an effect. Compares the fields, not the object, so a
  // parent that rebuilds the same range on each render does not discard the user's edits.
  if (syncedValue.from !== value.from || syncedValue.to !== value.to) {
    setSyncedValue(value);
    setDraft(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(draft);
  }

  function handleReset() {
    setDraft(value);
    onReset();
  }

  function applyPreset(period: DatePresetPeriod) {
    setDraft(calculateDateRangePreset(today, period));
  }

  function handleFromChange(event: ChangeEvent<HTMLInputElement>) {
    const from = event.target.value;
    setDraft((current) => ({ ...current, from }));
  }

  function handleToChange(event: ChangeEvent<HTMLInputElement>) {
    const to = event.target.value;
    setDraft((current) => ({ ...current, to }));
  }

  return (
    <form className="dexa-date-range-filter" onSubmit={handleSubmit}>
      <fieldset className="dexa-date-range-filter__range">
        <legend className="dexa-date-range-filter__legend">Date range</legend>
        <div className="dexa-date-range-filter__fields">
          <TextField
            type="date"
            name="from"
            label="From"
            value={draft.from}
            onChange={handleFromChange}
          />
          <TextField
            type="date"
            name="to"
            label="To"
            value={draft.to}
            error={error}
            onChange={handleToChange}
          />
        </div>
      </fieldset>
      <div className="dexa-date-range-filter__presets" role="group" aria-label="Quick ranges">
        {DATE_RANGE_PRESETS.map((preset) => (
          <Button key={preset.label} variant="secondary" onClick={() => applyPreset(preset.period)}>
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="dexa-date-range-filter__actions">
        <Button type="submit">Search</Button>
        <Button variant="secondary" onClick={handleReset}>
          Reset
        </Button>
      </div>
    </form>
  );
}
