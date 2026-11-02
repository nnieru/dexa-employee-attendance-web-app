import { useRef, useState } from 'react';
import { Alert, Button, Dialog, Textarea } from '@dexa/ui';
import type { RequestDecision } from '../api/decide-request.js';
import { REVIEW_REASON_REQUIRED_MESSAGE } from '../utils/approval-decision-messages.js';
import { REQUEST_REASON_MAX_LENGTH } from '@dexa/contracts';

type RequestDecisionDialogProps = {
  decision: RequestDecision;
  isPending: boolean;
  errorMessage: string | undefined;
  onClose: () => void;
  onConfirm: (reviewReason: string) => void;
};

/** Approve and Reject share one dialog: the review reason is optional for approve and required for reject. */
export function RequestDecisionDialog({
  decision,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: RequestDecisionDialogProps) {
  const [reviewReason, setReviewReason] = useState('');
  const [isReasonMissing, setIsReasonMissing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isApprove = decision === 'approve';

  function handleConfirm() {
    const trimmedReason = reviewReason.trim();
    if (!isApprove && trimmedReason.length === 0) {
      setIsReasonMissing(true);
      textareaRef.current?.focus();
      return;
    }
    setIsReasonMissing(false);
    onConfirm(trimmedReason);
  }

  return (
    <Dialog
      open
      title={isApprove ? 'Approve this request?' : 'Reject this request?'}
      description={
        isApprove
          ? 'The approved values take effect and the employee sees the decision.'
          : 'Attendance does not change. The employee sees the reason you enter.'
      }
      initialFocusRef={textareaRef}
      isDismissible={!isPending}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isPending} onClick={handleConfirm}>
            {isApprove ? 'Approve request' : 'Reject request'}
          </Button>
        </>
      }
    >
      {errorMessage !== undefined && <Alert variant="error">{errorMessage}</Alert>}
      <Textarea
        ref={textareaRef}
        label="Review note"
        required={!isApprove}
        value={reviewReason}
        maxLength={REQUEST_REASON_MAX_LENGTH}
        error={isReasonMissing ? REVIEW_REASON_REQUIRED_MESSAGE : undefined}
        hint={isApprove ? 'Optional when approving.' : 'Required when rejecting.'}
        onChange={(event) => setReviewReason(event.target.value)}
      />
    </Dialog>
  );
}
