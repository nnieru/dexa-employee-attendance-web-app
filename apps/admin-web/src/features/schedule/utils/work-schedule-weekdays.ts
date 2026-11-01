import type { WorkScheduleVersion } from '@dexa/contracts';

/** The form value of each weekday checkbox. Checkbox values are strings, so the form keeps the ISO number as text. */
export const WORKING_WEEKDAY_VALUES = ['1', '2', '3', '4', '5', '6', '7'] as const;

export type WorkingWeekdayValue = (typeof WORKING_WEEKDAY_VALUES)[number];

export type WorkingWeekdayOption = {
  value: WorkingWeekdayValue;
  /** The ISO weekday number (1 is Monday) that the API stores. */
  weekday: number;
  label: string;
};

// Monday first, as in the mockup. The order here is the order the checkboxes and the summary list them in.
export const WORKING_WEEKDAY_OPTIONS: ReadonlyArray<WorkingWeekdayOption> = [
  { value: '1', weekday: 1, label: 'Mon' },
  { value: '2', weekday: 2, label: 'Tue' },
  { value: '3', weekday: 3, label: 'Wed' },
  { value: '4', weekday: 4, label: 'Thu' },
  { value: '5', weekday: 5, label: 'Fri' },
  { value: '6', weekday: 6, label: 'Sat' },
  { value: '7', weekday: 7, label: 'Sun' },
];

/** The checked checkbox values for a stored version. Returns them in weekday order. */
export function toWorkingWeekdayValues(
  workingWeekdays: WorkScheduleVersion['workingWeekdays'],
): Array<WorkingWeekdayValue> {
  return WORKING_WEEKDAY_OPTIONS.filter((option) => workingWeekdays.includes(option.weekday)).map(
    (option) => option.value,
  );
}

/** The ISO weekday numbers for the checked values, in ascending order, as the API expects them. */
export function toWorkingWeekdayNumbers(values: ReadonlyArray<WorkingWeekdayValue>): Array<number> {
  return WORKING_WEEKDAY_OPTIONS.filter((option) => values.includes(option.value)).map(
    (option) => option.weekday,
  );
}

/** Lists the working days for display, for example "Mon, Tue, Wed, Thu, Fri". */
export function formatWorkingWeekdays(
  workingWeekdays: WorkScheduleVersion['workingWeekdays'],
): string {
  return WORKING_WEEKDAY_OPTIONS.filter((option) => workingWeekdays.includes(option.weekday))
    .map((option) => option.label)
    .join(', ');
}
