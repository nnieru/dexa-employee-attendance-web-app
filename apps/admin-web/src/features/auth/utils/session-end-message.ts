import type { SessionEndReason } from '../types/session-end-reason.js';

const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  ACCOUNT_DISABLED: 'Your account has been deactivated.',
  UNAUTHORIZED: 'Your session has ended. Sign in again.',
};

export function getSessionEndMessage(endReason: SessionEndReason): string {
  return SESSION_END_MESSAGES[endReason];
}
