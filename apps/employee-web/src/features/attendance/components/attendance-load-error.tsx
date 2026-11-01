import { Alert, Button } from '@dexa/ui';
import {
  ATTENDANCE_LOAD_FAILED_MESSAGE,
  SCHEDULE_NOT_CONFIGURED_MESSAGE,
} from '../utils/attendance-copy.js';
import { isScheduleNotConfiguredError } from '../utils/get-attendance-error-message.js';

type AttendanceLoadErrorProps = {
  error: unknown;
  isRetrying: boolean;
  onRetry: () => void;
};

// A missing schedule will not clear by retrying, so that message has no retry action; HR has to act first.
export function AttendanceLoadError({ error, isRetrying, onRetry }: AttendanceLoadErrorProps) {
  if (isScheduleNotConfiguredError(error)) {
    return <Alert variant="error">{SCHEDULE_NOT_CONFIGURED_MESSAGE}</Alert>;
  }
  return (
    <Alert
      variant="error"
      action={
        <Button variant="secondary" isLoading={isRetrying} onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {ATTENDANCE_LOAD_FAILED_MESSAGE}
    </Alert>
  );
}
