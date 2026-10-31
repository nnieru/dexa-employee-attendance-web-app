import { useEffect, useRef } from 'react';

type UseAutoDismissInput = {
  /** Milliseconds of unpaused time before onDismiss runs. Null means the toast never auto-dismisses. */
  durationMs: number | null;
  isPaused: boolean;
  onDismiss: () => void;
};

/**
 * Pausing keeps the time already elapsed, so a toast the pointer just left still gets its remaining
 * time instead of restarting. Timers use the global setTimeout and Date so fake timers control them
 * in tests.
 */
export function useAutoDismiss({ durationMs, isPaused, onDismiss }: UseAutoDismissInput): void {
  const remainingMsRef = useRef(durationMs ?? 0);

  useEffect(() => {
    if (durationMs === null || isPaused) {
      return undefined;
    }

    const resumedAtMs = Date.now();
    const timeoutId = window.setTimeout(onDismiss, remainingMsRef.current);

    return () => {
      window.clearTimeout(timeoutId);
      remainingMsRef.current = Math.max(0, remainingMsRef.current - (Date.now() - resumedAtMs));
    };
  }, [durationMs, isPaused, onDismiss]);
}
