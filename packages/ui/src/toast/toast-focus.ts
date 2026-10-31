const TOAST_SELECTOR = '[data-toast-id]';
const CLOSE_BUTTON_SELECTOR = '.dexa-toast__close';

/**
 * Chooses where focus goes when the toast with toastId is removed. Returns null when focus is not
 * inside that toast, so dismissing an unfocused toast never moves focus. Otherwise focus moves to the
 * next toast's close button, then the previous one's, and falls back to the live region when no
 * toasts remain.
 */
export function findFocusTargetForDismissedToast(
  region: HTMLElement,
  toastId: string,
): HTMLElement | null {
  const toastElements = Array.from(region.querySelectorAll<HTMLElement>(TOAST_SELECTOR));
  const dismissedIndex = toastElements.findIndex((element) => element.dataset.toastId === toastId);
  const dismissedElement: HTMLElement | undefined = toastElements[dismissedIndex];
  if (!dismissedElement?.contains(region.ownerDocument.activeElement)) {
    return null;
  }

  const nextElement: HTMLElement | undefined = toastElements[dismissedIndex + 1];
  const previousElement: HTMLElement | undefined = toastElements[dismissedIndex - 1];
  const neighbourElement = nextElement ?? previousElement;
  return neighbourElement?.querySelector<HTMLElement>(CLOSE_BUTTON_SELECTOR) ?? region;
}
