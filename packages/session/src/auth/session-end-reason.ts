import { ErrorCode } from '@dexa/contracts';

// Server codes that end a signed-in session (D-13). INVALID_CREDENTIALS is deliberately absent: a failed
// login is not a session end.
export type SessionEndReason = typeof ErrorCode.ACCOUNT_DISABLED | typeof ErrorCode.UNAUTHORIZED;
