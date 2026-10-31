import { Module } from '@nestjs/common';
import { DEAD_LETTER_ARCHIVE_WRITER } from './dead-letter-archive.interface.js';
import { DeadLetterArchiveRepository } from './dead-letter-archive.repository.js';
import { DeadLetterArchiveService } from './dead-letter-archive.service.js';

@Module({
  providers: [
    DeadLetterArchiveService,
    { provide: DEAD_LETTER_ARCHIVE_WRITER, useClass: DeadLetterArchiveRepository },
  ],
  exports: [DeadLetterArchiveService],
})
export class DeadLetterModule {}
