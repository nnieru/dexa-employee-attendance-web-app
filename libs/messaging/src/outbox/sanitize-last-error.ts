import { types } from 'node:util';
import { describeError } from '../describe-error.js';

/** Bounds the stored text so one long broker message cannot bloat the outbox row. */
export const LAST_ERROR_MAX_LENGTH = 500;

const REDACTED_URL = '<redacted url>';

// Matches any scheme-prefixed URL, not only ones with credentials. The broker URL also names its host, and
// the outbox stores none of it. Parentheses end the match, so a URL inside "(caused by ...)" keeps its brackets.
const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()]*/gi;

/**
 * The text kept in outbox_events.last_error: the error name and message, plus one level of cause (the
 * publisher wraps the network failure in a cause). Every URL is removed, and the result is length-bounded.
 */
export function sanitizeLastError(error: unknown): string {
  const redacted = describeWithCause(error).replace(URL_PATTERN, REDACTED_URL);
  return truncate(redacted.replace(/\s+/g, ' ').trim());
}

function describeWithCause(error: unknown): string {
  const description = describeError(error);
  if (!types.isNativeError(error) || error.cause === undefined) {
    return description;
  }
  return `${description} (caused by ${describeError(error.cause)})`;
}

// Counts code points, so a cut never splits a surrogate pair.
function truncate(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= LAST_ERROR_MAX_LENGTH) {
    return text;
  }
  return `${characters.slice(0, LAST_ERROR_MAX_LENGTH - 1).join('')}…`;
}
