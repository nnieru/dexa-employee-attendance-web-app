import { Module } from '@nestjs/common';
import { CorrectionRequestController } from './correction-request.controller.js';
import { CorrectionRequestListRepository } from './correction-request-list.repository.js';
import { CORRECTION_REQUEST_LIST_READER } from './correction-request-list.repository.interface.js';
import { CorrectionRequestListService } from './correction-request-list.service.js';
import { CORRECTION_REQUEST_LIST_SERVICE } from './correction-request-list.service.interface.js';
import { CORRECTION_REQUEST_REPOSITORY } from './correction-request.repository.interface.js';
import { CorrectionRequestRepository } from './correction-request.repository.js';
import { CORRECTION_REQUEST_SERVICE } from './correction-request.service.interface.js';
import { CorrectionRequestService } from './correction-request.service.js';

@Module({
  controllers: [CorrectionRequestController],
  providers: [
    { provide: CORRECTION_REQUEST_SERVICE, useClass: CorrectionRequestService },
    { provide: CORRECTION_REQUEST_REPOSITORY, useClass: CorrectionRequestRepository },
    { provide: CORRECTION_REQUEST_LIST_SERVICE, useClass: CorrectionRequestListService },
    { provide: CORRECTION_REQUEST_LIST_READER, useClass: CorrectionRequestListRepository },
  ],
})
export class CorrectionsModule {}
