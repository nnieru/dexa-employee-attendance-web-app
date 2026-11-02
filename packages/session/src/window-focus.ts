import { focusManager } from '@tanstack/react-query';

/**
 * Re-checks queries with refetchOnWindowFocus when the window regains focus. TanStack's default
 * listens only to visibilitychange, which does not fire when a visible desktop window gains focus, so this
 * replaces the default listener with one that also listens to window focus. Call once at app start.
 * The returned function removes both listeners.
 */
export function listenForWindowFocus(): () => void {
  let removeListeners: () => void = () => undefined;

  focusManager.setEventListener((handleFocus) => {
    // Calling without a value re-evaluates focus and notifies every subscriber, so each focus event counts.
    const handleEvent = () => handleFocus();
    window.addEventListener('focus', handleEvent);
    window.addEventListener('visibilitychange', handleEvent);
    removeListeners = () => {
      window.removeEventListener('focus', handleEvent);
      window.removeEventListener('visibilitychange', handleEvent);
    };
    return removeListeners;
  });

  return () => removeListeners();
}
