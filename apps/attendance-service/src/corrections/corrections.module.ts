import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module.js';
import { CorrectionRequestController } from './correction-request.controller.js';
import { CorrectionRequestDecisionController } from './correction-request-decision.controller.js';
import { CorrectionRequestDecisionRepository } from './correction-request-decision.repository.js';
import { CORRECTION_REQUEST_DECISION_REPOSITORY } from './correction-request-decision.repository.interface.js';
import { CorrectionRequestDecisionService } from './correction-request-decision.service.js';
import { CORRECTION_REQUEST_DECISION_SERVICE } from './correction-request-decision.service.interface.js';
import { CorrectionRequestListRepository } from './correction-request-list.repository.js';
import { CORRECTION_REQUEST_LIST_READER } from './correction-request-list.repository.interface.js';
import { CorrectionRequestListService } from './correction-request-list.service.js';
import { CORRECTION_REQUEST_LIST_SERVICE } from './correction-request-list.service.interface.js';
import { CorrectionRequestReviewController } from './correction-request-review.controller.js';
import { CorrectionRequestReviewRepository } from './correction-request-review.repository.js';
import { CORRECTION_REQUEST_REVIEW_READER } from './correction-request-review.repository.interface.js';
import { CorrectionRequestReviewService } from './correction-request-review.service.js';
import { CORRECTION_REQUEST_REVIEW_SERVICE } from './correction-request-review.service.interface.js';
import { CORRECTION_REQUEST_REPOSITORY } from './correction-request.repository.interface.js';
import { CorrectionRequestRepository } from './correction-request.repository.js';
import { CORRECTION_REQUEST_SERVICE } from './correction-request.service.interface.js';
import { CorrectionRequestService } from './correction-request.service.js';

@Module({
  imports: [EmployeesModule],
  controllers: [
    CorrectionRequestController,
    CorrectionRequestReviewController,
    CorrectionRequestDecisionController,
  ],
  providers: [
    { provide: CORRECTION_REQUEST_SERVICE, useClass: CorrectionRequestService },
    { provide: CORRECTION_REQUEST_REPOSITORY, useClass: CorrectionRequestRepository },
    { provide: CORRECTION_REQUEST_LIST_SERVICE, useClass: CorrectionRequestListService },
    { provide: CORRECTION_REQUEST_LIST_READER, useClass: CorrectionRequestListRepository },
    { provide: CORRECTION_REQUEST_REVIEW_SERVICE, useClass: CorrectionRequestReviewService },
    { provide: CORRECTION_REQUEST_REVIEW_READER, useClass: CorrectionRequestReviewRepository },
    { provide: CORRECTION_REQUEST_DECISION_SERVICE, useClass: CorrectionRequestDecisionService },
    {
      provide: CORRECTION_REQUEST_DECISION_REPOSITORY,
      useClass: CorrectionRequestDecisionRepository,
    },
  ],
})
export class CorrectionsModule {}
