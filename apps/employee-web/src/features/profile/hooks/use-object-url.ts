import { useMemo, useSyncExternalStore } from 'react';

type ObjectUrlStore = {
  getUrl: () => string | null;
  subscribe: (onChange: () => void) => () => void;
};

const NO_OBJECT_URL_STORE: ObjectUrlStore = {
  getUrl: () => null,
  subscribe: () => () => undefined,
};

/**
 * An object URL that exists only while something subscribes to it. The first subscriber creates the URL and
 * the last one revokes it, so React's subscription lifecycle revokes on unmount and when the blob changes.
 * StrictMode's extra mount cycle revokes and then creates a fresh URL. The URL is never created during render.
 */
function createObjectUrlStore(source: Blob): ObjectUrlStore {
  let url: string | null = null;
  const listeners = new Set<() => void>();
  return {
    getUrl: () => url,
    subscribe: (onChange) => {
      listeners.add(onChange);
      url ??= URL.createObjectURL(source);
      return () => {
        listeners.delete(onChange);
        if (listeners.size > 0 || url === null) return;
        URL.revokeObjectURL(url);
        url = null;
      };
    },
  };
}

/** Returns an object URL for the blob while it is shown, or null when there is no blob. */
export function useObjectUrl(source: Blob | null): string | null {
  const store = useMemo(
    () => (source === null ? NO_OBJECT_URL_STORE : createObjectUrlStore(source)),
    [source],
  );
  return useSyncExternalStore(store.subscribe, store.getUrl);
}
