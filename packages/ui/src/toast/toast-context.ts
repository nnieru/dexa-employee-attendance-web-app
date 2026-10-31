import { createContext } from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export type ToastLink = {
  label: string;
  href: string;
};

export type ShowToastInput = {
  link?: ToastLink;
  message: string;
  /** Optional bold line above the message, for example "Profile updated". */
  title?: string;
  variant?: ToastVariant;
};

export type ToastRecord = {
  id: string;
  link?: ToastLink;
  message: string;
  title?: string;
  variant: ToastVariant;
};

export type ToastApi = {
  /** Adds a toast to the live region and returns its id for dismissToast. */
  showToast: (input: ShowToastInput) => string;
  dismissToast: (toastId: string) => void;
};

/**
 * Null outside ToastProvider so useToast can fail loudly instead of silently dropping toasts.
 * The value holds only stable functions; toast contents stay inside the provider and never
 * re-render consumers.
 */
export const ToastContext = createContext<ToastApi | null>(null);
