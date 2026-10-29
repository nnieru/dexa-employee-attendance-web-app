import { jest } from '@jest/globals';
import { Logger, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { RmqContext } from '@nestjs/microservices';
import { defer, lastValueFrom, type Observable } from 'rxjs';
import { NonRetryableMessageError } from './event-delivery.errors.js';
import { RmqAckInterceptor } from './rmq-ack.interceptor.js';

const QUEUE = 'audit-worker.events';
const EVENT_TYPE = 'employee.profile.updated';
const EVENT_ID = '6f1c2a7e-3b4d-4e8f-9a1b-2c3d4e5f6a7b';
const VALID_EVENT = {
  eventId: EVENT_ID,
  type: EVENT_TYPE,
  occurredAt: '2026-10-29T03:15:00.000Z',
  payload: { accountId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', changedFields: ['phoneNumber'] },
};

type SettlementCall =
  | { readonly action: 'ack' }
  | { readonly action: 'nack'; readonly requeue: boolean }
  | { readonly action: 'reject'; readonly requeue: boolean };

// Stands in for the amqplib channel that delivered the message. It records each settlement, and can be set
// to fail the way a channel does after it closed.
class RecordingChannel {
  readonly calls: SettlementCall[] = [];
  closedWith: Error | undefined;

  ack(): void {
    this.record({ action: 'ack' });
  }

  nack(_message: unknown, _allUpTo: boolean, requeue: boolean): void {
    this.record({ action: 'nack', requeue });
  }

  reject(_message: unknown, requeue: boolean): void {
    this.record({ action: 'reject', requeue });
  }

  private record(call: SettlementCall): void {
    if (this.closedWith !== undefined) {
      throw this.closedWith;
    }
    this.calls.push(call);
  }
}

// Stands in for the handler. It counts how often Nest would run it and then runs the test's behaviour.
class FakeHandler implements CallHandler {
  invocations = 0;

  constructor(private readonly behaviour: () => Promise<void>) {}

  handle(): Observable<unknown> {
    return defer(() => {
      this.invocations += 1;
      return this.behaviour();
    });
  }
}

function buildRpcContext(data: unknown, channel: RecordingChannel): ExecutionContext {
  const message = {
    content: Buffer.from(JSON.stringify({ pattern: EVENT_TYPE, data })),
    fields: { deliveryTag: 1, redelivered: false, exchange: 'app.events', routingKey: EVENT_TYPE },
    properties: { messageId: EVENT_ID },
  };
  const rmqContext = new RmqContext([message, channel, EVENT_TYPE]);
  const context = new ExecutionContextHost([data, rmqContext]);
  context.setType('rpc');
  return context;
}

function buildInterceptor(): RmqAckInterceptor {
  return new RmqAckInterceptor(QUEUE);
}

describe('RmqAckInterceptor', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should ack the delivery when the handler resolves', async () => {
    const channel = new RecordingChannel();
    const handler = new FakeHandler(() => Promise.resolve());

    await lastValueFrom(
      buildInterceptor().intercept(buildRpcContext(VALID_EVENT, channel), handler),
      { defaultValue: undefined },
    );

    expect(handler.invocations).toBe(1);
    expect(channel.calls).toEqual([{ action: 'ack' }]);
  });

  it('should settle the delivery only after the handler resolves when the handler is still running', async () => {
    const channel = new RecordingChannel();
    let finishHandler: () => void = () => undefined;
    const handler = new FakeHandler(
      () =>
        new Promise<void>((resolve) => {
          finishHandler = resolve;
        }),
    );

    const completion = lastValueFrom(
      buildInterceptor().intercept(buildRpcContext(VALID_EVENT, channel), handler),
      { defaultValue: undefined },
    );
    expect(channel.calls).toEqual([]);

    finishHandler();
    await completion;
    expect(channel.calls).toEqual([{ action: 'ack' }]);
  });

  it('should requeue with reject and complete without an error when the handler throws a transient error', async () => {
    const channel = new RecordingChannel();
    const handler = new FakeHandler(() => Promise.reject(new Error('database unavailable')));

    await expect(
      lastValueFrom(buildInterceptor().intercept(buildRpcContext(VALID_EVENT, channel), handler), {
        defaultValue: undefined,
      }),
    ).resolves.toBeUndefined();

    expect(channel.calls).toEqual([{ action: 'reject', requeue: true }]);
  });

  it('should dead-letter with nack and no requeue when the handler throws NonRetryableMessageError', async () => {
    const channel = new RecordingChannel();
    const handler = new FakeHandler(() =>
      Promise.reject(new NonRetryableMessageError('payload rejected by validation')),
    );

    await lastValueFrom(
      buildInterceptor().intercept(buildRpcContext(VALID_EVENT, channel), handler),
      { defaultValue: undefined },
    );

    expect(channel.calls).toEqual([{ action: 'nack', requeue: false }]);
  });

  it('should dead-letter with nack and not call the handler when the body is not an event message', async () => {
    const channel = new RecordingChannel();
    const handler = new FakeHandler(() => Promise.resolve());

    await lastValueFrom(
      buildInterceptor().intercept(buildRpcContext({ foo: 'bar' }, channel), handler),
      { defaultValue: undefined },
    );

    expect(handler.invocations).toBe(0);
    expect(channel.calls).toEqual([{ action: 'nack', requeue: false }]);
  });

  it('should log the transient failure as a warning when the handler throws a transient error', async () => {
    const channel = new RecordingChannel();
    const handler = new FakeHandler(() => Promise.reject(new Error('database unavailable')));

    await lastValueFrom(
      buildInterceptor().intercept(buildRpcContext(VALID_EVENT, channel), handler),
      { defaultValue: undefined },
    );

    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining(`Event ${EVENT_ID} (${EVENT_TYPE}) failed on ${QUEUE}; requeued`),
    );
  });

  it('should pass the call to the handler without settling when the context is not an RPC context', async () => {
    const channel = new RecordingChannel();
    const handler = new FakeHandler(() => Promise.resolve());
    const rmqContext = new RmqContext([{}, channel, EVENT_TYPE]);
    const httpContext = new ExecutionContextHost([VALID_EVENT, rmqContext]);
    httpContext.setType('http');

    await lastValueFrom(buildInterceptor().intercept(httpContext, handler), {
      defaultValue: undefined,
    });

    expect(handler.invocations).toBe(1);
    expect(channel.calls).toEqual([]);
  });

  it('should log the failure and complete without throwing when the channel cannot acknowledge', async () => {
    const channel = new RecordingChannel();
    channel.closedWith = new Error('Channel closed');
    const handler = new FakeHandler(() => Promise.resolve());

    await expect(
      lastValueFrom(buildInterceptor().intercept(buildRpcContext(VALID_EVENT, channel), handler), {
        defaultValue: undefined,
      }),
    ).resolves.toBeUndefined();

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining(`Could not acknowledge event ${EVENT_ID}`),
    );
  });
});
