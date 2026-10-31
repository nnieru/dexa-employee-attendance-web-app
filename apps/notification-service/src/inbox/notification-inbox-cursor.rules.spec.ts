import { decodeInboxCursor, encodeInboxCursor } from './notification-inbox-cursor.rules.js';

const ROW_ID = '3f6a1c2e-8b9d-4e7f-a0b1-c2d3e4f5a6b7';
const CREATED_AT = new Date('2026-10-30T02:05:01.000Z');

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('encodeInboxCursor and decodeInboxCursor', () => {
  it('should decode to the same sort key when it decodes a cursor it encoded', () => {
    const cursor = encodeInboxCursor({ createdAt: CREATED_AT, id: ROW_ID });

    expect(decodeInboxCursor(cursor)).toEqual({ createdAt: CREATED_AT, id: ROW_ID });
  });

  it('should produce a URL-safe string with no padding', () => {
    const cursor = encodeInboxCursor({ createdAt: CREATED_AT, id: ROW_ID });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    { condition: 'the cursor is not base64url text', cursor: '%%%not-a-cursor%%%' },
    {
      condition: 'the cursor decodes to text that is not JSON',
      cursor: encodePayloadText('{not json'),
    },
    { condition: 'the payload is a JSON array', cursor: encodePayload([CREATED_AT, ROW_ID]) },
    { condition: 'the payload is a JSON null', cursor: encodePayload(null) },
    {
      condition: 'the payload has no id',
      cursor: encodePayload({ createdAt: CREATED_AT.toISOString() }),
    },
    {
      condition: 'the payload has an extra key',
      cursor: encodePayload({ createdAt: CREATED_AT.toISOString(), id: ROW_ID, role: 'HR' }),
    },
    {
      condition: 'the id is not a UUID',
      cursor: encodePayload({ createdAt: CREATED_AT.toISOString(), id: 'row-1' }),
    },
    {
      condition: 'the createdAt is not an ISO instant',
      cursor: encodePayload({ createdAt: '30 Oct 2026', id: ROW_ID }),
    },
    {
      condition: 'the createdAt is a day that does not exist',
      cursor: encodePayload({ createdAt: '2026-02-30T02:05:01.000Z', id: ROW_ID }),
    },
    { condition: 'the cursor is empty text', cursor: '' },
  ])('should return undefined when $condition', ({ cursor }) => {
    expect(decodeInboxCursor(cursor)).toBeUndefined();
  });
});

// The base64url of text that is not JSON, built from the raw text rather than through JSON.stringify.
function encodePayloadText(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}
