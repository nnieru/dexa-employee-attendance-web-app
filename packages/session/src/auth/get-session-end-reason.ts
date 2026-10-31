import { ErrorCode } from '@dexa/contracts';
import type { SessionEndReason } from './session-end-reason.js';

export function getSessionEndReason(code: ErrorCode): SessionEndReason | null {
  if (code === ErrorCode.ACCOUNT_DISABLED) return code;
  if (code === ErrorCode.UNAUTHORIZED) return code;
  return null;
}
