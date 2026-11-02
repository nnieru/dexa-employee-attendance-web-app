import { GatewayUserAuthGuard, Roles, RolesGuard, type BusinessDate } from '@dexa/common';
import {
  Role,
  workCalendarDateListQuerySchema,
  workCalendarDateParamSchema,
  workCalendarDateRequestSchema,
  type WorkCalendarDate,
  type WorkCalendarDatePage,
  type WorkCalendarDateListQuery,
  type WorkCalendarDateRequest,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  WORK_CALENDAR_DATE_SERVICE,
  type IWorkCalendarDateService,
} from './work-calendar-date.service.interface.js';
import {
  WORK_CALENDAR_DATE_WRITE_SERVICE,
  type IWorkCalendarDateWriteService,
} from './work-calendar-date-write.service.interface.js';

// HR only. Employees never read or change the company calendar through this service.
@Controller('work-calendar-dates')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class WorkCalendarDateController {
  constructor(
    @Inject(WORK_CALENDAR_DATE_SERVICE) private readonly calendarDates: IWorkCalendarDateService,
    @Inject(WORK_CALENDAR_DATE_WRITE_SERVICE)
    private readonly calendarDateWrites: IWorkCalendarDateWriteService,
  ) {}

  @Get()
  listDates(
    @Query(new ZodValidationPipe(workCalendarDateListQuerySchema)) query: WorkCalendarDateListQuery,
  ): Promise<WorkCalendarDatePage> {
    return this.calendarDates.listDates(query);
  }

  // A save answers 200 with the stored exception, whether it is new or replaces an earlier one.
  @Put(':date')
  upsertDate(
    @Param('date', new ZodValidationPipe(workCalendarDateParamSchema)) date: BusinessDate,
    @Body(new ZodValidationPipe(workCalendarDateRequestSchema)) request: WorkCalendarDateRequest,
  ): Promise<WorkCalendarDate> {
    return this.calendarDateWrites.upsertDate(date, request);
  }

  @Delete(':date')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDate(
    @Param('date', new ZodValidationPipe(workCalendarDateParamSchema)) date: BusinessDate,
  ): Promise<void> {
    return this.calendarDateWrites.deleteDate(date);
  }
}
