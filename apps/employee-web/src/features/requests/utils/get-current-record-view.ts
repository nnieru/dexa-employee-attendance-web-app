import type { AttendanceSummaryItem } from '@dexa/contracts';

/** What the current-record panel shows. Each state is one branch, so the panel renders exactly one of them. */
export type CurrentRecordView =
  | { kind: 'choose-date' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'record'; record: AttendanceSummaryItem };

export type CurrentRecordQueryState = {
  isDateSelectable: boolean;
  isPending: boolean;
  /** True while the previous date's row is kept on screen for the date that was just chosen. Not shown as the record. */
  isPlaceholderData: boolean;
  isError: boolean;
  /** Undefined before the first answer, null when the employee has no row for the date. */
  record: AttendanceSummaryItem | null | undefined;
};

/** Maps the query state to the panel. A bad date wins over everything, and a failure wins over stale rows. */
export function getCurrentRecordView(state: CurrentRecordQueryState): CurrentRecordView {
  if (!state.isDateSelectable) return { kind: 'choose-date' };
  if (state.isError) return { kind: 'error' };
  if (state.isPending || state.isPlaceholderData || state.record === undefined) {
    return { kind: 'loading' };
  }
  if (state.record === null) return { kind: 'empty' };
  return { kind: 'record', record: state.record };
}
