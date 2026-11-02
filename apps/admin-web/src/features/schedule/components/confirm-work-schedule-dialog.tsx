import { ConfirmDialog } from '@dexa/ui';
import {
  SAVE_DIALOG_CONFIRM_LABEL,
  SAVE_DIALOG_TITLE,
  getSaveDialogDescription,
} from '../utils/work-schedule-messages.js';

type ConfirmWorkScheduleDialogProps = {
  /** The effective date of the save waiting for confirmation, or an empty string while nothing waits. */
  effectiveFrom: string;
  isBusy: boolean;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Asks before a version is saved. Cancel sends nothing (recorded days are never reclassified). */
export function ConfirmWorkScheduleDialog({
  effectiveFrom,
  isBusy,
  open,
  onCancel,
  onConfirm,
}: ConfirmWorkScheduleDialogProps) {
  return (
    <ConfirmDialog
      confirmLabel={SAVE_DIALOG_CONFIRM_LABEL}
      description={getSaveDialogDescription(effectiveFrom)}
      isBusy={isBusy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={open}
      title={SAVE_DIALOG_TITLE}
    />
  );
}
