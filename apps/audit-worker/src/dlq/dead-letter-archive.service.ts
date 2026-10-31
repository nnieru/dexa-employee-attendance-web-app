import { CLOCK, type IClock } from '@dexa/common';
import { Inject, Injectable } from '@nestjs/common';
import {
  buildDeadLetterArchiveRecord,
  type DeadLetterDelivery,
} from './dead-letter-archive.rules.js';
import {
  DEAD_LETTER_ARCHIVE_WRITER,
  type IDeadLetterArchiveWriter,
} from './dead-letter-archive.interface.js';

@Injectable()
export class DeadLetterArchiveService {
  constructor(
    @Inject(DEAD_LETTER_ARCHIVE_WRITER) private readonly writer: IDeadLetterArchiveWriter,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  /** Resolves once the failure row is committed. The caller acknowledges the delivery only after this resolves. */
  async archive(sourceQueue: string, delivery: DeadLetterDelivery): Promise<void> {
    const record = buildDeadLetterArchiveRecord({
      sourceQueue,
      delivery,
      observedAt: this.clock.now(),
    });
    await this.writer.upsertFailure(record);
  }
}
