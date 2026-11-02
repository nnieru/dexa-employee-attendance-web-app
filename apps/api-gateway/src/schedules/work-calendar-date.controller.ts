import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
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
} from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  WORK_CALENDAR_DATE_CLIENT,
  type IWorkCalendarDateClient,
} from './work-calendar-date-client.interface.js';

// HR only. Employees never reach attendance-service for the company calendar.
@Controller('work-calendar-dates')
export class WorkCalendarDateController {
  constructor(
    @Inject(WORK_CALENDAR_DATE_CLIENT) private readonly calendarDates: IWorkCalendarDateClient,
  ) {}

  @Roles(Role.HR)
  @Get()
  listDates(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(workCalendarDateListQuerySchema)) query: WorkCalendarDateListQuery,
  ): Promise<WorkCalendarDatePage> {
    return this.calendarDates.listDates(user, query);
  }

  // The body is strict, so a client cannot send the date in it. attendance-service validates it again. A save answers
  // 200 with the stored exception.
  @Roles(Role.HR)
  @Put(':date')
  upsertDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date', new ZodValidationPipe(workCalendarDateParamSchema)) date: string,
    @Body(new ZodValidationPipe(workCalendarDateRequestSchema)) request: WorkCalendarDateRequest,
  ): Promise<WorkCalendarDate> {
    return this.calendarDates.upsertDate(user, date, request);
  }

  // A delete answers 204 with no body when attendance-service removed the exception.
  @Roles(Role.HR)
  @Delete(':date')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date', new ZodValidationPipe(workCalendarDateParamSchema)) date: string,
  ): Promise<void> {
    return this.calendarDates.deleteDate(user, date);
  }
}
