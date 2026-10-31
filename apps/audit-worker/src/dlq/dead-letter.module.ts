import { HealthModule } from '@dexa/common';
import { Module } from '@nestjs/common';
import { DEAD_LETTER_ARCHIVE_WRITER } from './dead-letter-archive.interface.js';
import { DeadLetterArchiveRepository } from './dead-letter-archive.repository.js';
import { DeadLetterArchiveService } from './dead-letter-archive.service.js';
import { DeadLetterConsumerStatus } from './dead-letter-consumer-status.js';
import { DeadLetterHealthIndicator } from './dead-letter-health.indicator.js';

@Module({
  imports: [HealthModule],
  providers: [
    DeadLetterArchiveService,
    { provide: DEAD_LETTER_ARCHIVE_WRITER, useClass: DeadLetterArchiveRepository },
    DeadLetterConsumerStatus,
    DeadLetterHealthIndicator,
  ],
  exports: [DeadLetterArchiveService, DeadLetterConsumerStatus],
})
export class DeadLetterModule {}
