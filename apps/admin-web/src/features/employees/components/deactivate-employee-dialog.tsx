import { ConfirmDialog } from '@dexa/ui';

type DeactivateEmployeeDialogProps = {
  employeeName: string;
  isBusy: boolean;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Asks before HR deactivates an account (ADM-2). Deactivation logs the person out at once (AUTH-5). */
export function DeactivateEmployeeDialog({
  employeeName,
  isBusy,
  open,
  onCancel,
  onConfirm,
}: DeactivateEmployeeDialogProps) {
  return (
    <ConfirmDialog
      confirmLabel="Deactivate employee"
      description="They are logged out immediately and cannot sign in until their status is changed back."
      isBusy={isBusy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={open}
      title={`Deactivate ${employeeName}?`}
      tone="danger"
    />
  );
}
