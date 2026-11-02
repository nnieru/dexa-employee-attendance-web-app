import {
  DependencyUnavailableError,
  ForbiddenError,
  SERVICE_TOKEN_SIGNER,
  ServiceName,
  type DomainError,
  type IServiceTokenSigner,
} from '@dexa/common';
import { API_PREFIX, ErrorCode, errorResponseSchema } from '@dexa/contracts';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_SERVICE_BASE_URL,
  NOTIFICATION_STREAM_CONNECT_TIMEOUT,
  type INotificationStreamClient,
  type NotificationStreamRequest,
} from './notification-stream-client.interface.js';

const STREAM_PATH = `/${API_PREFIX}/notifications/stream`;
const DEPENDENCY_UNAVAILABLE_MESSAGE = 'A dependent service is unavailable. Try again shortly.';

// An error answer is a short JSON object. A longer body is not read, so a broken upstream cannot fill memory.
const MAX_ERROR_BODY_BYTES = 4_096;

/**
 * Opens the HR notification stream on notification-service with a token that names the user. It uses fetch
 * rather than the shared internal client, because that client buffers its answers and bounds the whole call, which
 * would end a stream that is meant to stay open. The connect timeout covers only the wait for the answer's headers.
 */
@Injectable()
export class NotificationStreamClient implements INotificationStreamClient {
  constructor(
    @Inject(NOTIFICATION_SERVICE_BASE_URL) private readonly baseUrl: string,
    @Inject(NOTIFICATION_STREAM_CONNECT_TIMEOUT)
    private readonly connectTimeoutMilliseconds: number,
    @Inject(SERVICE_TOKEN_SIGNER) private readonly tokenSigner: IServiceTokenSigner,
  ) {}

  async openStream(request: NotificationStreamRequest): Promise<ReadableStream<Uint8Array>> {
    const credential = await this.tokenSigner.signFor(
      ServiceName.NOTIFICATION_SERVICE,
      request.user,
    );
    const response = await this.connect(request, credential);
    if (response.status === HttpStatus.OK && response.body !== null) {
      return response.body;
    }
    if (response.status === HttpStatus.OK) {
      throw createUnavailableError(new Error('Notification stream answered without a body.'));
    }
    throw await this.toUpstreamError(response);
  }

  private async connect(request: NotificationStreamRequest, credential: string): Promise<Response> {
    const connection = new AbortController();
    const abortConnection = (): void => connection.abort();
    request.signal.addEventListener('abort', abortConnection, { once: true });
    if (request.signal.aborted) abortConnection();
    const connectTimer = setTimeout(abortConnection, this.connectTimeoutMilliseconds);
    try {
      return await fetch(`${this.baseUrl}${STREAM_PATH}`, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${credential}`,
        },
        // The token must not follow a redirect to another host, the same rule as the internal client.
        redirect: 'error',
        signal: connection.signal,
      });
    } catch (error: unknown) {
      // The browser left first, so the error has no one to reach and must not be reported as an outage.
      if (request.signal.aborted) throw error;
      throw createUnavailableError(toSafeCause(error));
    } finally {
      clearTimeout(connectTimer);
    }
  }

  // A 401 is never passed on: the token is the gateway's, and a refusal of it is a misconfiguration, not the user's
  // fault. The account was checked by the gateway before this call.
  private async toUpstreamError(response: Response): Promise<DomainError> {
    const cause = new Error(`Notification stream answered with HTTP ${response.status}.`);
    const remoteError = errorResponseSchema.safeParse(await readErrorBody(response));
    if (!remoteError.success) return createUnavailableError(cause);
    const { code, message, details } = remoteError.data;
    if (response.status === HttpStatus.FORBIDDEN && code === ErrorCode.FORBIDDEN) {
      return new ForbiddenError(code, message, { cause, details });
    }
    return createUnavailableError(cause);
  }
}

function createUnavailableError(cause: Error): DependencyUnavailableError {
  return new DependencyUnavailableError(
    ErrorCode.DEPENDENCY_UNAVAILABLE,
    DEPENDENCY_UNAVAILABLE_MESSAGE,
    {
      cause,
    },
  );
}

// A fetch failure can carry the URL and the request headers. The cause keeps only the failure's name, so a later log
// of the cause cannot leak the token.
function toSafeCause(error: unknown): Error {
  const reason = error instanceof Error ? error.name : 'unknown error';
  const cause = new Error(`Notification stream request failed (${reason}).`);
  cause.name = 'NotificationStreamRequestError';
  return cause;
}

// Returns undefined when the body is missing, too long, or not JSON. Each of those is treated as an answer that does
// not match the error contract, so the caller sees an outage rather than a refusal it cannot trust.
async function readErrorBody(response: Response): Promise<unknown> {
  if (response.body === null) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_ERROR_BODY_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  return parseJson(Buffer.concat(chunks).toString('utf8'));
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}
