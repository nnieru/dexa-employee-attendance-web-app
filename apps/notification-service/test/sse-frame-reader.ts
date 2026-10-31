// Reads server-sent event frames from a fetch body. A frame ends with a blank line. Only the fields the specs check are parsed.
export type SseFrame =
  | { readonly kind: 'heartbeat'; readonly text: string }
  | { readonly kind: 'notification'; readonly data: unknown }
  | { readonly kind: 'other'; readonly text: string };

const FRAME_SEPARATOR = '\n\n';
const NOTIFICATION_EVENT_LINE = 'event: notification';
const DATA_PREFIX = 'data: ';
const COMMENT_PREFIX = ':';
const READ_TIMEOUT_MS = 5_000;

export class SseFrameReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffer = '';

  constructor(body: ReadableStream<Uint8Array>) {
    this.reader = body.getReader();
  }

  /**
   * The next complete frame, or undefined once the server has ended the stream. A read that waits longer than the
   * timeout fails the spec, so a stream that never sends the awaited frame does not hang the run.
   */
  nextFrame(): Promise<SseFrame | undefined> {
    return withTimeout(this.readFrame(), READ_TIMEOUT_MS, 'the next stream frame');
  }

  async cancel(): Promise<void> {
    await this.reader.cancel().catch(() => undefined);
  }

  private async readFrame(): Promise<SseFrame | undefined> {
    for (;;) {
      const separatorIndex = this.buffer.indexOf(FRAME_SEPARATOR);
      if (separatorIndex !== -1) {
        const raw = this.buffer.slice(0, separatorIndex);
        this.buffer = this.buffer.slice(separatorIndex + FRAME_SEPARATOR.length);
        return parseFrame(raw);
      }
      const { done, value } = await this.reader.read();
      if (done) return undefined;
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }
}

function parseFrame(raw: string): SseFrame {
  if (raw.startsWith(COMMENT_PREFIX)) {
    return { kind: 'heartbeat', text: raw };
  }
  const lines = raw.split('\n');
  const dataLine = lines.find((line) => line.startsWith(DATA_PREFIX));
  if (lines.includes(NOTIFICATION_EVENT_LINE) && dataLine !== undefined) {
    const data: unknown = JSON.parse(dataLine.slice(DATA_PREFIX.length));
    return { kind: 'notification', data };
  }
  return { kind: 'other', text: raw };
}

async function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMilliseconds: number,
  description: string,
): Promise<TValue> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${description}.`));
    }, timeoutMilliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
