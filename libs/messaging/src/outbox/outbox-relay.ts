import type { IClock } from '@dexa/common';
import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { describeError } from '../describe-error.js';
import { parseEventMessage, type EventMessage } from '../event-message.js';
import { EventPublisherClosedError } from '../event-publisher.errors.js';
import type { IEventPublisher } from '../event-publisher.interface.js';
import type {
  IOutboxEventRepository,
  IOutboxPassTransaction,
  OutboxEventRecord,
} from './outbox-event-repository.interface.js';
import {
  calculateNextAttemptAt,
  calculateRetentionCutoff,
  isRetentionDue,
  STUCK_EVENT_ATTEMPT_THRESHOLD,
} from './outbox.rules.js';
import type { OutboxSettings } from './outbox-settings.js';
import { sanitizeLastError } from './sanitize-last-error.js';

type OutboxRelayDependencies = {
  readonly repository: IOutboxEventRepository;
  readonly publisher: IEventPublisher;
  readonly clock: IClock;
  readonly settings: OutboxSettings;
};

// Caps how many expired rows one delete statement removes, so a backlog never holds locks for long.
const RETENTION_BATCH_SIZE = 500;

/**
 * Publishes the service's outbox rows and deletes expired ones. A pass runs, then the relay waits one poll
 * interval after the pass ends before the next, so passes never overlap.
 *
 * Stop runs in onModuleDestroy, not onApplicationShutdown. Nest calls every onModuleDestroy before any
 * onApplicationShutdown, so by then the publisher and the database pool may already be closed.
 */
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly stopController = new AbortController();
  private passes: Promise<void> = Promise.resolve();
  private lastRetentionRunAt?: Date;

  constructor(private readonly dependencies: OutboxRelayDependencies) {}

  onApplicationBootstrap(): void {
    this.passes = this.runPassesUntilStopped().catch((error: unknown) => {
      this.logger.error(`Outbox relay stopped unexpectedly: ${describeError(error)}`);
    });
  }

  // Waits for the pass in flight, so stopping never abandons a claimed batch halfway through.
  async onModuleDestroy(): Promise<void> {
    this.stopController.abort();
    await this.passes;
  }

  private async runPassesUntilStopped(): Promise<void> {
    while (!this.stopController.signal.aborted) {
      await this.runPassSafely();
      await waitForNextPass(this.dependencies.settings.pollIntervalMs, this.stopController.signal);
    }
  }

  private async runPassSafely(): Promise<void> {
    try {
      await this.runPass();
    } catch (error: unknown) {
      // The pass rolled back, so its rows keep their state. Events it already sent before the failure are
      // sent again on a later pass. Consumers absorb that by event ID, which is the at-least-once contract.
      this.logger.error(`Outbox pass failed: ${describeError(error)}`);
    }
  }

  private async runPass(): Promise<void> {
    const now = this.dependencies.clock.now();
    await this.publishDueEvents(now);
    if (isRetentionDue(this.lastRetentionRunAt, now)) {
      this.lastRetentionRunAt = now;
      await this.deleteRetainedEvents(now);
    }
  }

  private async publishDueEvents(now: Date): Promise<void> {
    const { batchSize } = this.dependencies.settings;
    await this.dependencies.repository.runPassTransaction(async (transaction) => {
      const events = await transaction.claimDueEvents({ now, limit: batchSize });
      for (const event of events) {
        const isPublished = await this.publishEvent(transaction, event);
        if (!isPublished) {
          return;
        }
      }
    });
  }

  // Returns false when the pass must stop at this event, so later events are not published ahead of it.
  private async publishEvent(
    transaction: IOutboxPassTransaction,
    event: OutboxEventRecord,
  ): Promise<boolean> {
    const message = readStoredEnvelope(event);
    if (message === undefined) {
      await this.recordFailure(
        transaction,
        event,
        new Error('The stored payload is not the envelope of this event'),
      );
      return false;
    }
    try {
      await this.dependencies.publisher.publish(message);
    } catch (error: unknown) {
      if (error instanceof EventPublisherClosedError) {
        // Nothing was sent, so this is not an attempt. The pass commits what it already published.
        return false;
      }
      await this.recordFailure(transaction, event, error);
      return false;
    }
    await transaction.markEventPublished({
      id: event.id,
      publishedAt: this.dependencies.clock.now(),
    });
    return true;
  }

  private async recordFailure(
    transaction: IOutboxPassTransaction,
    event: OutboxEventRecord,
    error: unknown,
  ): Promise<void> {
    const attemptCount = event.attemptCount + 1;
    const nextAttemptAt = calculateNextAttemptAt(this.dependencies.clock.now(), attemptCount);
    const lastError = sanitizeLastError(error);
    await transaction.recordFailedAttempt({ id: event.id, attemptCount, nextAttemptAt, lastError });
    this.logFailure(event, { attemptCount, nextAttemptAt, lastError });
  }

  // Logs the event ID and type only. The payload can hold personal data, so it never reaches a log line.
  private logFailure(
    event: OutboxEventRecord,
    failure: {
      readonly attemptCount: number;
      readonly nextAttemptAt: Date;
      readonly lastError: string;
    },
  ): void {
    const message =
      `Event ${event.id} (${event.eventType}) was not published on attempt ${failure.attemptCount}; ` +
      `next attempt at ${failure.nextAttemptAt.toISOString()}: ${failure.lastError}`;
    if (failure.attemptCount >= STUCK_EVENT_ATTEMPT_THRESHOLD) {
      this.logger.error(message);
      return;
    }
    this.logger.warn(message);
  }

  private async deleteRetainedEvents(now: Date): Promise<void> {
    const { retentionDays } = this.dependencies.settings;
    const cutoff = calculateRetentionCutoff(now, retentionDays);
    let deletedCount = 0;
    let batchCount: number;
    do {
      batchCount = await this.dependencies.repository.deletePublishedBefore({
        cutoff,
        limit: RETENTION_BATCH_SIZE,
      });
      deletedCount += batchCount;
    } while (batchCount === RETENTION_BATCH_SIZE);
    if (deletedCount > 0) {
      this.logger.log(
        `Deleted ${deletedCount} published outbox events older than ${retentionDays} days`,
      );
    }
  }
}

// Checks the stored envelope again before sending it, and requires it to carry this row's ID. A row whose
// payload belongs to another event is treated as a failure, never sent under the wrong identity.
function readStoredEnvelope(event: OutboxEventRecord): EventMessage | undefined {
  const envelope = parseEventMessage(event.payload);
  if (envelope.kind === 'invalid' || envelope.message.eventId !== event.id) {
    return undefined;
  }
  return envelope.message;
}

// Ends early on stop, so shutdown does not wait out a full poll interval.
async function waitForNextPass(pollIntervalMs: number, stopSignal: AbortSignal): Promise<void> {
  try {
    await delay(pollIntervalMs, undefined, { signal: stopSignal });
  } catch (error: unknown) {
    if (!stopSignal.aborted) {
      throw error;
    }
  }
}
