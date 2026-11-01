import { Alert, Button, PageShell } from '@dexa/ui';
import type { WorkScheduleOverview } from '@dexa/contracts';
import { useWorkScheduleOverview } from '../hooks/use-work-schedule-overview.js';
import type { BusinessDate } from '../utils/schedule-business-date.js';
import { getEarliestEffectiveFrom } from '../utils/schedule-business-date.js';
import {
  CURRENT_HEADING,
  CURRENT_NOTE,
  CURRENT_STATUS_LABEL,
  NO_CURRENT_TEXT,
  NO_SCHEDULE_TEXT,
  NO_SCHEDULE_TITLE,
  NO_UPCOMING_TEXT,
  RETRY_LABEL,
  UPCOMING_HEADING,
  UPCOMING_NOTE,
  WORK_SCHEDULE_LOADING_TEXT,
  WORK_SCHEDULE_LOAD_ERROR_MESSAGE,
  WORK_SCHEDULE_PAGE_DESCRIPTION,
  WORK_SCHEDULE_PAGE_TITLE,
} from '../utils/work-schedule-messages.js';
import { WorkScheduleEditor } from './work-schedule-editor.js';
import { WorkScheduleVersionPanel } from './work-schedule-version-panel.js';

type WorkSchedulePageProps = {
  /** Today in the company timezone. The route reads the clock, so this page stays a function of its props. */
  today: BusinessDate;
};

/** The HR work schedule screen (PRD SCH-3, SCH-4). */
export function WorkSchedulePage({ today }: WorkSchedulePageProps) {
  const overviewQuery = useWorkScheduleOverview();
  const overview = overviewQuery.data;
  const earliestEffectiveFrom = getEarliestEffectiveFrom(today);

  return (
    <PageShell
      as="div"
      title={WORK_SCHEDULE_PAGE_TITLE}
      description={WORK_SCHEDULE_PAGE_DESCRIPTION}
    >
      {overview === undefined ? (
        <WorkScheduleLoadState
          isFailed={overviewQuery.isError}
          onRetry={() => void overviewQuery.refetch()}
        />
      ) : (
        <div className="work-schedule-page">
          {overviewQuery.isError && (
            <WorkScheduleLoadFailure onRetry={() => void overviewQuery.refetch()} />
          )}
          <WorkScheduleOverviewView overview={overview} />
          <WorkScheduleEditor
            current={overview.current}
            upcoming={overview.upcoming}
            earliestEffectiveFrom={earliestEffectiveFrom}
          />
        </div>
      )}
    </PageShell>
  );
}

function WorkScheduleOverviewView({ overview }: { overview: WorkScheduleOverview }) {
  if (overview.current === null && overview.upcoming === null) {
    return (
      <section className="hr-empty-state">
        <p className="hr-empty-state__title">{NO_SCHEDULE_TITLE}</p>
        <p className="hr-empty-state__text">{NO_SCHEDULE_TEXT}</p>
      </section>
    );
  }
  return (
    <div className="work-schedule-versions">
      <WorkScheduleVersionPanel
        heading={CURRENT_HEADING}
        headingId="work-schedule-current-heading"
        statusLabel={CURRENT_STATUS_LABEL}
        statusTone="success"
        note={CURRENT_NOTE}
        emptyText={NO_CURRENT_TEXT}
        version={overview.current}
      />
      <WorkScheduleVersionPanel
        heading={UPCOMING_HEADING}
        headingId="work-schedule-upcoming-heading"
        statusLabel={
          overview.upcoming === null ? 'None' : `Starts ${overview.upcoming.effectiveFrom}`
        }
        statusTone={overview.upcoming === null ? 'neutral' : 'info'}
        note={UPCOMING_NOTE}
        emptyText={NO_UPCOMING_TEXT}
        version={overview.upcoming}
      />
    </div>
  );
}

function WorkScheduleLoadState({ isFailed, onRetry }: { isFailed: boolean; onRetry: () => void }) {
  if (!isFailed) {
    return (
      <p className="work-schedule-page__status" role="status" aria-busy="true">
        {WORK_SCHEDULE_LOADING_TEXT}
      </p>
    );
  }
  return <WorkScheduleLoadFailure onRetry={onRetry} />;
}

function WorkScheduleLoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert
      variant="error"
      action={
        <Button variant="secondary" onClick={onRetry}>
          {RETRY_LABEL}
        </Button>
      }
    >
      {WORK_SCHEDULE_LOAD_ERROR_MESSAGE}
    </Alert>
  );
}
