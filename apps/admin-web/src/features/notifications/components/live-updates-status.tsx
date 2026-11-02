import { Alert } from '@dexa/ui';
import type { NotificationStreamState } from '../types/notification-stream-state.js';

const INTERRUPTED_MESSAGE =
  'Live updates are interrupted. Reconnecting. New changes still appear in the notification inbox.';
const STOPPED_MESSAGE =
  'Live updates are unavailable. New changes still appear in the notification inbox.';

type LiveUpdatesStatusProps = {
  state: NotificationStreamState;
};

/** Shows only while live delivery is delayed. The durable inbox stays available. */
export function LiveUpdatesStatus({ state }: LiveUpdatesStatusProps) {
  if (state === 'interrupted') return <Alert variant="warning">{INTERRUPTED_MESSAGE}</Alert>;
  if (state === 'stopped') return <Alert variant="warning">{STOPPED_MESSAGE}</Alert>;
  return null;
}
