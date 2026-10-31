import { jest } from '@jest/globals';
import {
  DependencyUnavailableError,
  ForbiddenError,
  ServiceName,
  type AuthenticatedUser,
  type IServiceTokenSigner,
} from '@dexa/common';
import { ErrorCode, Role } from '@dexa/contracts';
import { NotificationStreamClient } from './notification-stream.client.js';
import type { NotificationStreamRequest } from './notification-stream-client.interface.js';

const BASE_URL = 'http://notification-service:3000';
const STREAM_URL = `${BASE_URL}/api/v1/notifications/stream`;
const USER: AuthenticatedUser = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  role: Role.HR,
};
// The credential that the signer returns, so a test can see that the stream sends the signed token and nothing else.
const CREDENTIAL = 'internal-token-for-notification-service';
const CONNECT_TIMEOUT_MILLISECONDS = 20;
const EVENT_FRAME = 'event: notification\ndata: {}\n\n';
const OVERSIZED_BODY_BYTES = 8_192;

const signedFor: Array<{ audience: string; onBehalfOf: AuthenticatedUser | undefined }> = [];
const tokenSigner: IServiceTokenSigner = {
  signFor: (audience, onBehalfOf) => {
    signedFor.push({ audience, onBehalfOf });
    return Promise.resolve(CREDENTIAL);
  },
};

function clientWithShortTimeout(): NotificationStreamClient {
  return new NotificationStreamClient(BASE_URL, CONNECT_TIMEOUT_MILLISECONDS, tokenSigner);
}

function requestFor(signal: AbortSignal = new AbortController().signal): NotificationStreamRequest {
  return { user: USER, signal };
}

function jsonAnswer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Answers the headers at once, then sends the chunk after the delay. The body is tied to the request's signal, as
// fetch ties it, so an abort reaches the reader.
function slowBodyFetch(delayMilliseconds: number): typeof fetch {
  return (_input, init) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const timer = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(EVENT_FRAME));
          controller.close();
        }, delayMilliseconds);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          controller.error(new Error('aborted'));
        });
      },
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  };
}

describe('NotificationStreamClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    signedFor.length = 0;
  });

  it('should request the stream path with a token signed for notification-service on behalf of the user', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 200 }));

    await clientWithShortTimeout().openStream(requestFor());

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(STREAM_URL);
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${CREDENTIAL}`);
    expect(signedFor).toEqual([{ audience: ServiceName.NOTIFICATION_SERVICE, onBehalfOf: USER }]);
    expect(init?.redirect).toBe('error');
  });

  it('should resolve to the upstream body when the answer is 200', async () => {
    const upstreamBody = new Response(EVENT_FRAME).body;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(upstreamBody, { status: 200 }));

    const body = await clientWithShortTimeout().openStream(requestFor());

    expect(body).toBe(upstreamBody);
  });

  it('should keep the open body after the connect timeout has passed', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(slowBodyFetch(CONNECT_TIMEOUT_MILLISECONDS * 3));

    const body = await clientWithShortTimeout().openStream(requestFor());
    const chunk = await body.getReader().read();

    expect(new TextDecoder().decode(chunk.value)).toBe(EVENT_FRAME);
  });

  it('should abort the open body when the caller signal aborts', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(slowBodyFetch(60_000));
    const caller = new AbortController();
    const body = await clientWithShortTimeout().openStream(requestFor(caller.signal));

    caller.abort();

    await expect(body.getReader().read()).rejects.toThrow('aborted');
  });

  it('should report dependency unavailable when the headers do not arrive within the connect timeout', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    await expect(clientWithShortTimeout().openStream(requestFor())).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });

  it('should report dependency unavailable when the upstream refuses the gateway token, even with an account code', async () => {
    // The account was checked by the gateway, so a 401 here is a refused token: a misconfiguration, never the user's.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonAnswer(401, {
        statusCode: 401,
        code: ErrorCode.ACCOUNT_DISABLED,
        message: 'This account is no longer active.',
      }),
    );

    await expect(clientWithShortTimeout().openStream(requestFor())).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });

  it('should refuse with forbidden when the upstream answers 403 with the forbidden code', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonAnswer(403, {
        statusCode: 403,
        code: ErrorCode.FORBIDDEN,
        message: 'Your role cannot use this action.',
      }),
    );

    const failure = await clientWithShortTimeout()
      .openStream(requestFor())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ForbiddenError);
  });

  it('should report dependency unavailable when the upstream refuses a token with a code it does not name', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonAnswer(401, { statusCode: 401, code: 'SERVICE_TOKEN_REFUSED', message: 'Refused.' }),
      );

    await expect(clientWithShortTimeout().openStream(requestFor())).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });

  it('should report dependency unavailable when the upstream answers 500', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(clientWithShortTimeout().openStream(requestFor())).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });

  it('should report dependency unavailable when the error body is longer than the read limit', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('x'.repeat(OVERSIZED_BODY_BYTES), { status: 401 }));

    await expect(clientWithShortTimeout().openStream(requestFor())).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });

  it('should report dependency unavailable without the token when the connection fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const failure = await clientWithShortTimeout()
      .openStream(requestFor())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DependencyUnavailableError);
    const cause = failure instanceof Error ? failure.cause : undefined;
    expect(String(cause)).not.toContain(CREDENTIAL);
  });
});
