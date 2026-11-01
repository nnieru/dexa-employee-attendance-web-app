import { useState } from 'react';
import type { WorkScheduleVersion } from '@dexa/contracts';
import { Alert, useToast } from '@dexa/ui';
import {
  useSaveWorkScheduleVersion,
  type WorkScheduleSave,
} from '../hooks/use-save-work-schedule-version.js';
import type { WorkScheduleFormValues } from '../types/work-schedule-form.schema.js';
import type { BusinessDate } from '../utils/schedule-business-date.js';
import {
  toCreateWorkScheduleFormValues,
  toEditWorkScheduleFormValues,
} from '../utils/to-work-schedule-form-values.js';
import { toWorkScheduleVersionRequest } from '../utils/to-work-schedule-version-request.js';
import {
  CONFLICT_MESSAGE,
  EDIT_VERSION_DESCRIPTION,
  EDIT_VERSION_HEADING,
  EDIT_VERSION_SUBMIT_LABEL,
  NEW_VERSION_DESCRIPTION,
  NEW_VERSION_HEADING,
  NEW_VERSION_SUBMIT_LABEL,
  WORK_SCHEDULE_SAVED_MESSAGE,
  getWorkScheduleSaveErrorMessage,
  isWorkScheduleConflictError,
} from '../utils/work-schedule-messages.js';
import { ConfirmWorkScheduleDialog } from './confirm-work-schedule-dialog.js';
import { WorkScheduleForm } from './work-schedule-form.js';

type WorkScheduleEditorProps = {
  current: WorkScheduleVersion | null;
  upcoming: WorkScheduleVersion | null;
  earliestEffectiveFrom: BusinessDate;
};

/**
 * Creates the upcoming version, or edits it when one exists. A second upcoming version would conflict, so the upcoming
 * version is always the one that is edited (DATABASE §5.2). The version in effect is never edited here.
 */
export function WorkScheduleEditor({
  current,
  upcoming,
  earliestEffectiveFrom,
}: WorkScheduleEditorProps) {
  const saveMutation = useSaveWorkScheduleVersion();
  const { showToast } = useToast();
  const [pendingSave, setPendingSave] = useState<WorkScheduleSave | null>(null);
  const isEditing = upcoming !== null;
  const defaultValues =
    upcoming !== null
      ? toEditWorkScheduleFormValues(upcoming)
      : toCreateWorkScheduleFormValues(current);

  function requestSave(values: WorkScheduleFormValues) {
    if (saveMutation.isPending) return;
    const request = toWorkScheduleVersionRequest(values);
    setPendingSave(
      upcoming !== null
        ? { kind: 'update', versionId: upcoming.id, request }
        : { kind: 'create', request },
    );
  }

  function confirmSave() {
    if (pendingSave === null) return;
    saveMutation.mutate(pendingSave, {
      onSuccess: () => {
        setPendingSave(null);
        showToast({ variant: 'success', message: WORK_SCHEDULE_SAVED_MESSAGE });
      },
      onError: () => setPendingSave(null),
    });
  }

  return (
    <section className="work-schedule-editor" aria-labelledby="work-schedule-editor-heading">
      <h2 id="work-schedule-editor-heading">
        {isEditing ? EDIT_VERSION_HEADING : NEW_VERSION_HEADING}
      </h2>
      <p className="work-schedule-editor__description">
        {isEditing ? EDIT_VERSION_DESCRIPTION : NEW_VERSION_DESCRIPTION}
      </p>
      {saveMutation.isError && (
        <Alert variant="error">
          {isWorkScheduleConflictError(saveMutation.error)
            ? CONFLICT_MESSAGE
            : getWorkScheduleSaveErrorMessage(saveMutation.error)}
        </Alert>
      )}
      <WorkScheduleForm
        key={toFormKey(current, upcoming)}
        defaultValues={defaultValues}
        earliestEffectiveFrom={earliestEffectiveFrom}
        isBusy={saveMutation.isPending}
        submitLabel={isEditing ? EDIT_VERSION_SUBMIT_LABEL : NEW_VERSION_SUBMIT_LABEL}
        onValidSubmit={requestSave}
      />
      <ConfirmWorkScheduleDialog
        effectiveFrom={pendingSave?.request.effectiveFrom ?? ''}
        isBusy={saveMutation.isPending}
        open={pendingSave !== null}
        onCancel={() => setPendingSave(null)}
        onConfirm={confirmSave}
      />
    </section>
  );
}

/**
 * The form restarts whenever the schedule it starts from changes, for example after a conflict reload, so it never
 * shows values that another change has replaced. An unchanged refetch keeps the same key and the typed values.
 */
function toFormKey(
  current: WorkScheduleVersion | null,
  upcoming: WorkScheduleVersion | null,
): string {
  return JSON.stringify({ current, upcoming });
}
