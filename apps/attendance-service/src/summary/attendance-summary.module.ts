import { Module } from '@nestjs/common';
import { ATTENDANCE_SUMMARY_READER } from './attendance-summary.repository.interface.js';
import { AttendanceSummaryRepository } from './attendance-summary.repository.js';
import { AttendanceSummaryController } from './attendance-summary.controller.js';
import { ATTENDANCE_SUMMARY_SERVICE } from './attendance-summary.service.interface.js';
import { AttendanceSummaryService } from './attendance-summary.service.js';

@Module({
  controllers: [AttendanceSummaryController],
  providers: [
    { provide: ATTENDANCE_SUMMARY_SERVICE, useClass: AttendanceSummaryService },
    { provide: ATTENDANCE_SUMMARY_READER, useClass: AttendanceSummaryRepository },
  ],
})
export class AttendanceSummaryModule {}
