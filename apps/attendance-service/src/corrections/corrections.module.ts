import { Module } from '@nestjs/common';
import { CorrectionRequestController } from './correction-request.controller.js';
import { CORRECTION_REQUEST_REPOSITORY } from './correction-request.repository.interface.js';
import { CorrectionRequestRepository } from './correction-request.repository.js';
import { CORRECTION_REQUEST_SERVICE } from './correction-request.service.interface.js';
import { CorrectionRequestService } from './correction-request.service.js';

@Module({
  controllers: [CorrectionRequestController],
  providers: [
    { provide: CORRECTION_REQUEST_SERVICE, useClass: CorrectionRequestService },
    { provide: CORRECTION_REQUEST_REPOSITORY, useClass: CorrectionRequestRepository },
  ],
})
export class CorrectionsModule {}
