import type { DeadLetterArchiveRecord } from './dead-letter-archive.rules.js';

export interface IDeadLetterArchiveWriter {
  /**
   * Stores the failure, or refreshes the row for the same source queue and message ID. Resolves once the write has
   * committed, which is the point where the consumer may acknowledge the DLQ delivery.
   */
  upsertFailure(record: DeadLetterArchiveRecord): Promise<void>;
}

export const DEAD_LETTER_ARCHIVE_WRITER = Symbol('IDeadLetterArchiveWriter');
