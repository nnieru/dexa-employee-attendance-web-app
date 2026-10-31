import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';

// Headers for a relayed event stream. The no-transform directive and X-Accel-Buffering stop proxies from buffering or
// compressing the events, and nothing in the gateway adds a compression middleware.
export const EVENT_STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
  'X-Content-Type-Options': 'nosniff',
} as const;

/**
 * Copies the upstream stream to the client chunk by chunk, as each chunk is read, so an event leaves the gateway without
 * waiting for a buffer to fill. pipeline ends the client response when the upstream ends. When the client leaves, it
 * stops the generator, which cancels the upstream body and so closes the upstream connection. When the upstream fails,
 * it destroys the response, so the browser sees the connection end and reconnects.
 */
export async function relayEventStream(
  upstreamBody: ReadableStream<Uint8Array>,
  response: Response,
): Promise<void> {
  await pipeline(Readable.from(readChunks(upstreamBody)), response);
}

// Cancels the upstream body when the generator stops, whether the stream finished, the client left, or a write failed.
async function* readChunks(upstreamBody: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = upstreamBody.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    // After a finished or failed read, cancelling is a no-op or rejects only because the stream already ended.
    await reader.cancel().catch(() => undefined);
  }
}
