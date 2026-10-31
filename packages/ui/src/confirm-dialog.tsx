import { useRef, type ReactNode } from 'react';
import { Button } from './button.js';
import { Dialog } from './dialog.js';

type ConfirmDialogTone = 'default' | 'danger';

type ConfirmDialogProps = {
  cancelLabel?: ReactNode;
  confirmLabel: ReactNode;
  description: ReactNode;
  /** Shows the confirm action as busy and disables both actions and Escape until the work finishes. */
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: ReactNode;
  /** `danger` marks destructive actions with the error color; DESIGN has no separate danger color. */
  tone?: ConfirmDialogTone;
};

/**
 * Asks the person to confirm an action. Initial focus lands on the cancel action so pressing Enter
 * by accident does not confirm a destructive change.
 */
export function ConfirmDialog({
  cancelLabel = 'Cancel',
  confirmLabel,
  description,
  isBusy = false,
  onCancel,
  onConfirm,
  open,
  title,
  tone = 'default',
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      className={`dexa-confirm-dialog dexa-confirm-dialog--${tone}`}
      description={description}
      footer={
        <>
          <Button ref={cancelButtonRef} variant="secondary" disabled={isBusy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            className={`dexa-confirm-dialog__confirm dexa-confirm-dialog__confirm--${tone}`}
            isLoading={isBusy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
      initialFocusRef={cancelButtonRef}
      isDismissible={!isBusy}
      onClose={onCancel}
      open={open}
      showCloseButton={false}
      title={title}
    />
  );
}
