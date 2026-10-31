import { jest } from '@jest/globals';
import type { IAccountStatusReader } from '@dexa/common';
import type { Response } from 'express';
import { EventEmitter } from 'node:events';
import type { InsertedNotification } from '../ingestion/notification-writer.interface.js';
import { ScriptedAccountStatusReader } from '../../test/scripted-clients.js';
import { NotificationHub } from './notification-hub.js';
import { NotificationStreamService } from './notification-stream.service.js';
import { HEARTBEAT_FRAME, formatNotificationFrame } from './sse-frame.rules.js';

const RECIPIENT = '1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c';
const HEARTBEAT_MILLISECONDS = 1_000;

const INSERTED: InsertedNotification = {
  id: '3f6a1c2e-8b9d-4e7f-a0b1-c2d3e4f5a6b7',
  eventType: 'employee.profile.updated',
  recipientAccountId: RECIPIENT,
  title: 'Budi Santoso updated: phone number',
  body: 'Changed fields: phone number.',
  data: { changedFields: ['phoneNumber'] },
  occurredAt: new Date('2026-10-30T02:05:00.000Z'),
  createdAt: new Date('2026-10-30T02:05:01.000Z'),
  readAt: null,
};

// Records what the service writes. It covers the members the service uses; Express's Response has many more.
class FakeSseResponse extends EventEmitter {
  readonly chunks: string[] = [];
  statusCode: number | undefined;
  headers: Record<string, string> | undefined;
  destroyed = false;
  writableEnded = false;

  writeHead(statusCode: number, headers: Record<string, string>): this {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }

  flushHeaders(): void {
    return;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): this {
    if (this.writableEnded) return this;
    this.writableEnded = true;
    this.emit('close');
    return this;
  }

  // What Node does when the client leaves: the socket is gone and the response reports close.
  clientLeaves(): void {
    this.destroyed = true;
    this.emit('close');
  }
}

function serviceWith(
  accountStatuses: IAccountStatusReader,
  hub: NotificationHub,
): NotificationStreamService {
  return new NotificationStreamService(hub, accountStatuses, HEARTBEAT_MILLISECONDS);
}

// The service only takes a Response in the shape the fake provides, so the cast is confined to this test.
function asResponse(response: FakeSseResponse): Response {
  return response as unknown as Response;
}

describe('NotificationStreamService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should open the response as an event stream that proxies must not buffer or transform', () => {
    const accountStatuses = new ScriptedAccountStatusReader();
    const response = new FakeSseResponse();

    serviceWith(accountStatuses, new NotificationHub()).attach(RECIPIENT, asResponse(response));

    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  });

  it('should write the notification frame to the stream of its recipient', () => {
    const hub = new NotificationHub();
    const response = new FakeSseResponse();
    serviceWith(new ScriptedAccountStatusReader(), hub).attach(RECIPIENT, asResponse(response));

    hub.publish([INSERTED]);

    expect(response.chunks).toEqual([formatNotificationFrame(INSERTED)]);
  });

  it('should write a heartbeat frame on each interval while the account stays active', async () => {
    const accountStatuses = new ScriptedAccountStatusReader();
    accountStatuses.setActive(RECIPIENT, true);
    const response = new FakeSseResponse();
    serviceWith(accountStatuses, new NotificationHub()).attach(RECIPIENT, asResponse(response));

    await jest.advanceTimersByTimeAsync(HEARTBEAT_MILLISECONDS * 2);

    expect(response.chunks).toEqual([HEARTBEAT_FRAME, HEARTBEAT_FRAME]);
    expect(response.writableEnded).toBe(false);
  });

  it('should end the stream and drop its subscription when a heartbeat finds the account inactive', async () => {
    const accountStatuses = new ScriptedAccountStatusReader();
    accountStatuses.setActive(RECIPIENT, false);
    const hub = new NotificationHub();
    const response = new FakeSseResponse();
    serviceWith(accountStatuses, hub).attach(RECIPIENT, asResponse(response));

    await jest.advanceTimersByTimeAsync(HEARTBEAT_MILLISECONDS);

    expect(response.writableEnded).toBe(true);
    expect(response.chunks).toEqual([]);
    expect(hub.subscriberCount()).toBe(0);
  });

  it('should end the stream when the account check fails, rather than keep it open unverified', async () => {
    const failingAccountStatuses: IAccountStatusReader = {
      findAccountStatus: () => Promise.reject(new Error('auth-service is unreachable.')),
    };
    const response = new FakeSseResponse();
    serviceWith(failingAccountStatuses, new NotificationHub()).attach(
      RECIPIENT,
      asResponse(response),
    );

    await jest.advanceTimersByTimeAsync(HEARTBEAT_MILLISECONDS);

    expect(response.writableEnded).toBe(true);
    expect(response.chunks).toEqual([]);
  });

  it('should end every open stream and drop its subscription when the application shuts down', () => {
    const hub = new NotificationHub();
    const service = serviceWith(new ScriptedAccountStatusReader(), hub);
    const firstResponse = new FakeSseResponse();
    const secondResponse = new FakeSseResponse();
    service.attach(RECIPIENT, asResponse(firstResponse));
    service.attach(RECIPIENT, asResponse(secondResponse));

    service.beforeApplicationShutdown();

    expect(firstResponse.writableEnded).toBe(true);
    expect(secondResponse.writableEnded).toBe(true);
    expect(hub.subscriberCount()).toBe(0);
  });

  it('should drop the subscription and stop the heartbeats when the client leaves', async () => {
    const accountStatuses = new ScriptedAccountStatusReader();
    accountStatuses.setActive(RECIPIENT, true);
    const hub = new NotificationHub();
    const response = new FakeSseResponse();
    serviceWith(accountStatuses, hub).attach(RECIPIENT, asResponse(response));

    response.clientLeaves();
    hub.publish([INSERTED]);
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MILLISECONDS * 3);

    expect(hub.subscriberCount()).toBe(0);
    expect(response.chunks).toEqual([]);
  });
});
