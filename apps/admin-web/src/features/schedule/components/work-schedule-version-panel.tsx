import type { WorkScheduleVersion } from '@dexa/contracts';
import { StatusLabel, type StatusLabelProps } from '@dexa/ui';
import {
  EFFECTIVE_UNTIL_EXCLUSIVE_HINT,
  OPEN_ENDED_TEXT,
} from '../utils/work-schedule-messages.js';
import { formatWorkingWeekdays } from '../utils/work-schedule-weekdays.js';

type WorkScheduleVersionPanelProps = {
  heading: string;
  /** Shown when there is no version for this panel. */
  emptyText: string;
  headingId: string;
  note?: string;
  statusLabel: string;
  statusTone: NonNullable<StatusLabelProps['tone']>;
  version: WorkScheduleVersion | null;
};

/**
 * One version as read-only facts (SCH-3). The version in effect and the upcoming version use the same layout, and this
 * panel has no controls: editing lives in the form below.
 */
export function WorkScheduleVersionPanel({
  emptyText,
  heading,
  headingId,
  note,
  statusLabel,
  statusTone,
  version,
}: WorkScheduleVersionPanelProps) {
  return (
    <section className="work-schedule-panel" aria-labelledby={headingId}>
      <div className="work-schedule-panel__heading">
        <h2 id={headingId}>{heading}</h2>
        <StatusLabel tone={statusTone}>{statusLabel}</StatusLabel>
      </div>
      {version === null ? (
        <p className="work-schedule-panel__empty">{emptyText}</p>
      ) : (
        <>
          {note && <p className="work-schedule-panel__note">{note}</p>}
          <WorkScheduleSummary version={version} />
        </>
      )}
    </section>
  );
}

function WorkScheduleSummary({ version }: { version: WorkScheduleVersion }) {
  return (
    <>
      <dl className="work-schedule-summary">
        <dt>Working days</dt>
        <dd>{formatWorkingWeekdays(version.workingWeekdays)}</dd>
        <dt>Start time (WIB)</dt>
        <dd>{version.startTime}</dd>
        <dt>End time (WIB)</dt>
        <dd>{version.endTime}</dd>
        <dt>Late clock-in grace</dt>
        <dd>{formatMinutes(version.lateCheckinGraceMinutes)}</dd>
        <dt>Early clock-out grace</dt>
        <dd>{formatMinutes(version.earlyCheckoutGraceMinutes)}</dd>
        <dt>Late clock-out grace</dt>
        <dd>{formatMinutes(version.lateCheckoutGraceMinutes)}</dd>
        <dt>Effective from</dt>
        <dd>{version.effectiveFrom}</dd>
        <dt>Effective until</dt>
        <dd>{version.effectiveUntil ?? OPEN_ENDED_TEXT}</dd>
      </dl>
      {version.effectiveUntil !== null && (
        <p className="work-schedule-panel__hint">{EFFECTIVE_UNTIL_EXCLUSIVE_HINT}</p>
      )}
    </>
  );
}

function formatMinutes(minutes: number): string {
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
