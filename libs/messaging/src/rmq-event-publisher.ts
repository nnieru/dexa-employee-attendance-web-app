import type { OnModuleDestroy } from '@nestjs/common';
import { types } from 'node:util';
import {
  ClientProxyFactory,
  RmqRecordBuilder,
  Transport,
  type ClientProxy,
  type RmqRecord,
  type RmqRecordOptions,
} from '@nestjs/microservices';
import { catchError, lastValueFrom, throwError, timeout } from 'rxjs';
import type { EventMessage } from './event-message.js';
import type { IEventPublisher } from './event-publisher.interface.js';
import { EVENTS_EXCHANGE } from './event-topology.js';

/** How long a publish waits for the broker's confirm before it rejects. */
export const PUBLISH_TIMEOUT_MS = 5_000;

const EVENT_CONTENT_TYPE = 'application/json';

/**
 * amqp-connection-manager reads a publish `timeout` option and removes the message from its local queue when
 * the timeout fires, so an event the caller was told failed cannot be sent after a reconnect. Nest passes
 * record options to publish unchanged, but its RmqRecordOptions type does not list `timeout`.
 */
type PublishRecordOptions = RmqRecordOptions & { readonly timeout: number };

/**
 * A client for the events exchange. It declares the exchange and no queue: `wildcards` routes each event by
 * its type, and a publisher never binds a queue of its own.
 */
export function createEventPublisherClient(url: string): ClientProxy {
  return ClientProxyFactory.create({
    transport: Transport.RMQ,
    options: {
      urls: [url],
      exchange: EVENTS_EXCHANGE,
      exchangeType: 'topic',
      wildcards: true,
      persistent: true,
    },
  });
}

export class RmqEventPublisher implements IEventPublisher, OnModuleDestroy {
  private isClosed = false;

  constructor(private readonly client: ClientProxy) {}

  async publish(message: EventMessage): Promise<void> {
    if (this.isClosed) {
      throw new Error('Event publisher is closed');
    }
    try {
      await lastValueFrom(
        this.client.emit(message.type, buildEventRecord(message)).pipe(
          timeout({ first: PUBLISH_TIMEOUT_MS }),
          catchError((failure: unknown) => throwError(() => toPublishFailure(failure))),
        ),
        { defaultValue: undefined },
      );
    } catch (error: unknown) {
      throw new Error(`Event ${message.eventId} was not confirmed by the broker`, { cause: error });
    }
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    await this.client.close();
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}

/**
 * The event is the record's data, so the broker body is Nest's `{ pattern, data }` envelope with the event
 * as `data`. The AMQP message ID is the event ID, which consumers can use to deduplicate.
 */
export function buildEventRecord(message: EventMessage): RmqRecord {
  const options: PublishRecordOptions = {
    messageId: message.eventId,
    type: message.type,
    contentType: EVENT_CONTENT_TYPE,
    timeout: PUBLISH_TIMEOUT_MS,
  };
  return new RmqRecordBuilder(message).setOptions(options).build();
}

// A failed connection rejects with the connection manager's { err, url } record. The url holds the broker
// password, so the failure that leaves the publisher is the Error inside that record, or a generic Error for
// any other value. types.isNativeError is used instead of instanceof: errors from Node's net module come from
// another realm when the code runs under Jest's VM.
function toPublishFailure(failure: unknown): Error {
  const cause = isConnectionFailure(failure) ? failure.err : failure;
  return types.isNativeError(cause) ? cause : new Error('the broker rejected the publish');
}

function isConnectionFailure(value: unknown): value is { readonly err: unknown } {
  return typeof value === 'object' && value !== null && 'err' in value && 'url' in value;
}
