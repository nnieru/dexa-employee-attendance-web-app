import { z } from 'zod';

/** The sort key of the last item on a page. A page continues strictly after it in (created_at DESC, id DESC) order. */
export type InboxCursor = {
  readonly createdAt: Date;
  readonly id: string;
};

// Strict, so a cursor that carries any other key is refused, and each field is checked before it reaches a query.
const inboxCursorPayloadSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

/**
 * Encodes the sort key of a row as an opaque base64url string. The payload is JSON, so the encoding is not a secret
 * and is not signed: a client that edits it can only choose a different page of its own inbox, because every query
 * also filters by the recipient from the token.
 */
export function encodeInboxCursor(row: InboxCursor): string {
  const payload = { createdAt: row.createdAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor that encodeInboxCursor produced. Returns undefined for anything else, so the caller can refuse the
 * request with a 400 rather than running a query with a meaningless key.
 */
export function decodeInboxCursor(cursor: string): InboxCursor | undefined {
  const payload = parseJsonOrUndefined(Buffer.from(cursor, 'base64url').toString('utf8'));
  const parsed = inboxCursorPayloadSchema.safeParse(payload);
  if (!parsed.success) return undefined;
  const createdAt = new Date(parsed.data.createdAt);
  // z.iso.datetime() checks the shape but not every calendar day, and an invalid Date would fail inside the query.
  if (Number.isNaN(createdAt.getTime())) return undefined;
  return { createdAt, id: parsed.data.id };
}

// A cursor is untrusted input, so a value that is not JSON is an expected outcome here, not a fault to report.
function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
