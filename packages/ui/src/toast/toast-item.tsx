import { useCallback, useState, type FocusEvent } from 'react';
import { Icon, type IconName } from '../icon.js';
import { IconButton } from '../icon-button.js';
import { useAutoDismiss } from './use-auto-dismiss.js';
import type { ToastRecord, ToastVariant } from './toast-context.js';

/** Non-error toasts leave on their own after this long. Errors stay until the person closes them. */
export const TOAST_AUTO_DISMISS_MS = 5000;

const VARIANT_ICON_NAMES: Record<ToastVariant, IconName> = {
  error: 'info',
  info: 'bell',
  success: 'check',
  warning: 'info',
};

type ToastItemProps = {
  onDismiss: (toastId: string) => void;
  toast: ToastRecord;
};

export function ToastItem({ onDismiss, toast }: ToastItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const handleDismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);

  useAutoDismiss({
    durationMs: toast.variant === 'error' ? null : TOAST_AUTO_DISMISS_MS,
    isPaused: isHovered || isFocusWithin,
    onDismiss: handleDismiss,
  });

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocusTarget = event.relatedTarget;
    if (!(nextFocusTarget instanceof Node) || !event.currentTarget.contains(nextFocusTarget)) {
      setIsFocusWithin(false);
    }
  }

  return (
    <div
      data-toast-id={toast.id}
      className={`dexa-toast dexa-toast--${toast.variant}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocusWithin(true)}
      onBlur={handleBlur}
    >
      <Icon name={VARIANT_ICON_NAMES[toast.variant]} className="dexa-toast__icon" />
      <div className="dexa-toast__body">
        {toast.title && <p className="dexa-toast__title">{toast.title}</p>}
        <p className="dexa-toast__message">{toast.message}</p>
        {toast.link && (
          <a className="dexa-toast__link" href={toast.link.href}>
            {toast.link.label}
          </a>
        )}
      </div>
      <IconButton
        className="dexa-toast__close"
        aria-label={`Close: ${toast.message}`}
        iconName="x"
        onClick={handleDismiss}
      />
    </div>
  );
}
