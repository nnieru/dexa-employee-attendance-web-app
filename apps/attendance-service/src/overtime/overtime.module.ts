import { Module } from '@nestjs/common';
import { OvertimeRequestController } from './overtime-request.controller.js';
import { OvertimeRequestListRepository } from './overtime-request-list.repository.js';
import { OVERTIME_REQUEST_LIST_READER } from './overtime-request-list.repository.interface.js';
import { OvertimeRequestListService } from './overtime-request-list.service.js';
import { OVERTIME_REQUEST_LIST_SERVICE } from './overtime-request-list.service.interface.js';
import { OVERTIME_REQUEST_REPOSITORY } from './overtime-request.repository.interface.js';
import { OvertimeRequestRepository } from './overtime-request.repository.js';
import { OVERTIME_REQUEST_SERVICE } from './overtime-request.service.interface.js';
import { OvertimeRequestService } from './overtime-request.service.js';

@Module({
  controllers: [OvertimeRequestController],
  providers: [
    { provide: OVERTIME_REQUEST_SERVICE, useClass: OvertimeRequestService },
    { provide: OVERTIME_REQUEST_REPOSITORY, useClass: OvertimeRequestRepository },
    { provide: OVERTIME_REQUEST_LIST_SERVICE, useClass: OvertimeRequestListService },
    { provide: OVERTIME_REQUEST_LIST_READER, useClass: OvertimeRequestListRepository },
  ],
})
export class OvertimeModule {}
