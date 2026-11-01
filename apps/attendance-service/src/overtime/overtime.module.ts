import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module.js';
import { OvertimeRequestController } from './overtime-request.controller.js';
import { OvertimeRequestDecisionController } from './overtime-request-decision.controller.js';
import { OvertimeRequestDecisionRepository } from './overtime-request-decision.repository.js';
import { OVERTIME_REQUEST_DECISION_REPOSITORY } from './overtime-request-decision.repository.interface.js';
import { OvertimeRequestDecisionService } from './overtime-request-decision.service.js';
import { OVERTIME_REQUEST_DECISION_SERVICE } from './overtime-request-decision.service.interface.js';
import { OvertimeRequestListRepository } from './overtime-request-list.repository.js';
import { OVERTIME_REQUEST_LIST_READER } from './overtime-request-list.repository.interface.js';
import { OvertimeRequestListService } from './overtime-request-list.service.js';
import { OVERTIME_REQUEST_LIST_SERVICE } from './overtime-request-list.service.interface.js';
import { OvertimeRequestReviewController } from './overtime-request-review.controller.js';
import { OvertimeRequestReviewRepository } from './overtime-request-review.repository.js';
import { OVERTIME_REQUEST_REVIEW_READER } from './overtime-request-review.repository.interface.js';
import { OvertimeRequestReviewService } from './overtime-request-review.service.js';
import { OVERTIME_REQUEST_REVIEW_SERVICE } from './overtime-request-review.service.interface.js';
import { OVERTIME_REQUEST_REPOSITORY } from './overtime-request.repository.interface.js';
import { OvertimeRequestRepository } from './overtime-request.repository.js';
import { OVERTIME_REQUEST_SERVICE } from './overtime-request.service.interface.js';
import { OvertimeRequestService } from './overtime-request.service.js';

@Module({
  imports: [EmployeesModule],
  controllers: [
    OvertimeRequestController,
    OvertimeRequestReviewController,
    OvertimeRequestDecisionController,
  ],
  providers: [
    { provide: OVERTIME_REQUEST_SERVICE, useClass: OvertimeRequestService },
    { provide: OVERTIME_REQUEST_REPOSITORY, useClass: OvertimeRequestRepository },
    { provide: OVERTIME_REQUEST_LIST_SERVICE, useClass: OvertimeRequestListService },
    { provide: OVERTIME_REQUEST_LIST_READER, useClass: OvertimeRequestListRepository },
    { provide: OVERTIME_REQUEST_REVIEW_SERVICE, useClass: OvertimeRequestReviewService },
    { provide: OVERTIME_REQUEST_REVIEW_READER, useClass: OvertimeRequestReviewRepository },
    { provide: OVERTIME_REQUEST_DECISION_SERVICE, useClass: OvertimeRequestDecisionService },
    { provide: OVERTIME_REQUEST_DECISION_REPOSITORY, useClass: OvertimeRequestDecisionRepository },
  ],
})
export class OvertimeModule {}
