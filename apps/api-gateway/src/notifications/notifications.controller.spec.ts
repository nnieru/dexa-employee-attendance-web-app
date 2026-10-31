import type { Response } from 'express';
import { Writable } from 'node:stream';
import { Role } from '@dexa/contracts';
import type { IAccountStatusReader, AuthenticatedUser } from '@dexa/common';
import type {
  INotificationStreamClient,
  NotificationStreamRequest,
} from './notification-stream-client.interface.js';
import { NotificationsController } from './notifications.controller.js';

const USER: AuthenticatedUser = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  role: Role.HR,
};
// Short enough for a test to see several checks, long enough that a check runs before the stream is closed.
const ACCOUNT_CHECK_MILLISECONDS = 5;

// The relay writes into the response as a stream, so the fake is a Writable with the methods the controller
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

// Like fetch, the body errors when its request is aborted, and it never ends on its own.
function openBody(request: NotificationStreamRequest): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(streamController) {
      request.signal.addEventListener('abort', () => streamController.error(new Error('aborted')));
    },
  });
}

// Records the stream request, so a test can check whether the upstream was aborted.
function recordingStreams(): {
  client: INotificationStreamClient;
  requests: NotificationStreamRequest[];
} {
  const requests: NotificationStreamRequest[] = [];
  const client: INotificationStreamClient = {
    openStream: (request) => {
      requests.push(request);
      return Promise.resolve(openBody(request));
    },
  };
  return { client, requests };
}

// Stands in for auth-service's status: an account is active until a test flips it.
function accountStatusReader(isActive: () => boolean): IAccountStatusReader {
  return {
    findAccountStatus: () => Promise.resolve({ isActive: isActive() }),
  };
}

function waitForChecks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ACCOUNT_CHECK_MILLISECONDS * 4));
}

describe('NotificationsController', () => {
  it('should abort the upstream request of an open relay when the application shuts down', async () => {
    const { client, requests } = recordingStreams();
    const controller = new NotificationsController(
      client,
      accountStatusReader(() => true),
      ACCOUNT_CHECK_MILLISECONDS,
    );
    const response = new FakeResponse();
    const relay = controller.streamNotifications(USER, asResponse(response));

    await new Promise((resolve) => setImmediate(resolve));
    controller.beforeApplicationShutdown();

    expect(requests[0]?.signal.aborted).toBe(true);
    await relay;
  });

  it('should keep the stream open and abort nothing while the account stays active', async () => {
    const { client, requests } = recordingStreams();
    const controller = new NotificationsController(
      client,
      accountStatusReader(() => true),
      ACCOUNT_CHECK_MILLISECONDS,
    );
    const response = new FakeResponse();
    const relay = controller.streamNotifications(USER, asResponse(response));

    await waitForChecks();

    expect(requests[0]?.signal.aborted).toBe(false);
    expect(response.destroyed).toBe(false);
    controller.beforeApplicationShutdown();
    await relay;
  });

  it('should close the client stream and abort the upstream when the account is deactivated', async () => {
    const { client, requests } = recordingStreams();
    let isActive = true;
    const controller = new NotificationsController(
      client,
      accountStatusReader(() => isActive),
      ACCOUNT_CHECK_MILLISECONDS,
    );
    const response = new FakeResponse();
    const relay = controller.streamNotifications(USER, asResponse(response));

    isActive = false;
    await relay;

    expect(requests[0]?.signal.aborted).toBe(true);
    expect(response.destroyed).toBe(true);
  });

  it('should pass the user to the upstream, so notification-service signs its token for that user', async () => {
    const { client, requests } = recordingStreams();
    const controller = new NotificationsController(
      client,
      accountStatusReader(() => true),
      ACCOUNT_CHECK_MILLISECONDS,
    );
    const response = new FakeResponse();
    const relay = controller.streamNotifications(USER, asResponse(response));

    await new Promise((resolve) => setImmediate(resolve));

    expect(requests[0]?.user).toEqual(USER);
    controller.beforeApplicationShutdown();
    await relay;
  });

  it('should close the client stream when the account check fails', async () => {
    const { client, requests } = recordingStreams();
    const failingReader: IAccountStatusReader = {
      findAccountStatus: () => Promise.reject(new Error('auth-service is unavailable')),
    };
    const controller = new NotificationsController(
      client,
      failingReader,
      ACCOUNT_CHECK_MILLISECONDS,
    );
    const response = new FakeResponse();

    await controller.streamNotifications(USER, asResponse(response));

    expect(requests[0]?.signal.aborted).toBe(true);
    expect(response.destroyed).toBe(true);
  });
});
