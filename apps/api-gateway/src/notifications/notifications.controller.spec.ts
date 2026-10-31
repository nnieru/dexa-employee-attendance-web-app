import type { Response } from 'express';
import { Writable } from 'node:stream';
import type {
  INotificationStreamClient,
  NotificationStreamRequest,
} from './notification-stream-client.interface.js';
import { NotificationsController } from './notifications.controller.js';

const ACCESS_TOKEN = 'hr-access-token-value';

// The relay writes into the response as a stream, so the fake is a Writable with the two header methods the controller
// calls. The cast is confined to this spec, because Express's Response has many more members.
class FakeResponse extends Writable {
  constructor() {
    super({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
  }

  writeHead(): this {
    return this;
  }

  flushHeaders(): void {
    return;
  }
}

function asResponse(response: FakeResponse): Response {
  return response as unknown as Response;
}

describe('NotificationsController', () => {
  it('should abort the upstream request of an open relay when the application shuts down', async () => {
    let upstreamSignal: AbortSignal | undefined;
    const client: INotificationStreamClient = {
      // Like fetch, the body errors when its request is aborted, and it never ends on its own.
      openStream: (request: NotificationStreamRequest) => {
        upstreamSignal = request.signal;
        const body = new ReadableStream<Uint8Array>({
          start(streamController) {
            request.signal.addEventListener('abort', () =>
              streamController.error(new Error('aborted')),
            );
          },
        });
        return Promise.resolve(body);
      },
    };
    const controller = new NotificationsController(client);
    const response = new FakeResponse();
    const relay = controller.streamNotifications(`Bearer ${ACCESS_TOKEN}`, asResponse(response));
    await new Promise((resolve) => setImmediate(resolve));

    controller.beforeApplicationShutdown();

    expect(upstreamSignal?.aborted).toBe(true);
    await relay;
  });
});
