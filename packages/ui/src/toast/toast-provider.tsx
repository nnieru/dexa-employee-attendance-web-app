import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ToastContext,
  type ShowToastInput,
  type ToastApi,
  type ToastRecord,
} from './toast-context.js';
import { findFocusTargetForDismissedToast } from './toast-focus.js';
import { ToastItem } from './toast-item.js';

type ToastProviderProps = {
  children: ReactNode;
};

/**
 * Owns the toast list and renders the single live region. The region is always in the DOM:
 * screen readers only announce insertions into a region that already exists. It is polite for every
 * variant, including errors. Error toasts persist rather than interrupting, so a second assertive
 * region would announce the same message twice.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const lastToastNumberRef = useRef(0);
  const regionRef = useRef<HTMLDivElement>(null);

  const dismissToast = useCallback((toastId: string) => {
    const region = regionRef.current;
    if (region) {
      // Move focus before the toast leaves the DOM, otherwise the focused element is lost to the body.
      findFocusTargetForDismissedToast(region, toastId)?.focus();
    }
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback((input: ShowToastInput): string => {
    lastToastNumberRef.current += 1;
    const toastId = `toast-${lastToastNumberRef.current}`;
    const toast: ToastRecord = {
      id: toastId,
      link: input.link,
      message: input.message,
      variant: input.variant ?? 'info',
    };
    setToasts((currentToasts) => [...currentToasts, toast]);
    return toastId;
  }, []);

  const toastApi = useMemo<ToastApi>(
    () => ({ dismissToast, showToast }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      <div
        ref={regionRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="dexa-toast-region"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
