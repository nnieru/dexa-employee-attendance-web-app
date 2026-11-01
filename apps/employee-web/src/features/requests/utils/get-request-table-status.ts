import type { DataTableStatus } from '@dexa/ui';
import { REQUESTS_LOAD_ERROR_MESSAGE } from './requests-messages.js';

/** Maps a query to the table state. An error wins over stale rows, so a failed reload is never hidden (DESIGN §9). */
export function getRequestTableStatus({
  isError,
  isFetching,
  isPending,
  onRetry,
}: {
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  onRetry: () => void;
}): DataTableStatus {
  if (isError) return { kind: 'error', message: REQUESTS_LOAD_ERROR_MESSAGE, onRetry };
  if (isPending) return { kind: 'loading' };
  if (isFetching) return { kind: 'refreshing' };
  return { kind: 'ready' };
}
