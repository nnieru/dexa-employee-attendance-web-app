import { ConfirmDialog } from '@dexa/ui';
import type { WorkCalendarDate } from '@dexa/contracts';
import {
  REMOVE_DIALOG_CONFIRM_LABEL,
  REMOVE_DIALOG_TITLE,
  getRemoveDialogDescription,
} from '../utils/calendar-exception-messages.js';

type CalendarExceptionRemoveDialogProps = {
  exception: WorkCalendarDate;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Asks before an exception is removed. Cancel sends nothing. Mounted only while a removal is pending. */
export function CalendarExceptionRemoveDialog({
  exception,
  isBusy,
  onCancel,
  onConfirm,
}: CalendarExceptionRemoveDialogProps) {
  return (
    <ConfirmDialog
      confirmLabel={REMOVE_DIALOG_CONFIRM_LABEL}
      description={getRemoveDialogDescription(exception.date)}
      isBusy={isBusy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
      title={REMOVE_DIALOG_TITLE}
      tone="danger"
    />
  );
}
