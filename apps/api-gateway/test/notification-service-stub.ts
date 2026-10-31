import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

// Stands in for notification-service's stream route. The test decides when each frame is written, so it can show that
// the gateway passes a frame on before the next one exists. Nothing listens here except this stub.
export type UpstreamStream = {
  // The Authorization header the gateway sent with the stream request.
  readonly authorization: string | undefined;
  write(frame: string): void;
  end(): void;
  // Resolves once the connection is closed from either side.
  readonly closed: Promise<void>;
};

export type NotificationServiceStub = {
  readonly baseUrl: string;
  // Every request to the stub, including those a test expects to be refused before they reach it.
  requestCount(): number;
  // Resolves with the next stream request the gateway opens.
  nextStream(): Promise<UpstreamStream>;
  close(): Promise<void>;
};

export async function startNotificationServiceStub(): Promise<NotificationServiceStub> {
  const arrivals: UpstreamStream[] = [];
  const waiters: Array<(stream: UpstreamStream) => void> = [];
  let requests = 0;

  const server = createServer((request, response) => {
    requests += 1;
    const stream = openStream(request, response);
    const waiter = waiters.shift();
    if (waiter === undefined) {
      arrivals.push(stream);
    } else {
      waiter(stream);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The stub did not listen on a TCP port.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requestCount: () => requests,
    nextStream: () => {
      const arrival = arrivals.shift();
      if (arrival !== undefined) return Promise.resolve(arrival);
      return new Promise<UpstreamStream>((resolve) => waiters.push(resolve));
    },
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    },
  };
}

function openStream(request: IncomingMessage, response: ServerResponse): UpstreamStream {
  const closed = new Promise<void>((resolve) => response.once('close', resolve));
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  response.flushHeaders();
  return {
    authorization: request.headers.authorization,
    write: (frame: string) => {
      response.write(frame);
    },
    end: () => {
      response.end();
    },
    closed,
  };
}
