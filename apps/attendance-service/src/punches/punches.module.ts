import { Module } from '@nestjs/common';
import { CLOCK_IN_SERVICE } from './clock-in.service.interface.js';
import { ClockInService } from './clock-in.service.js';
import { CLOCK_OUT_SERVICE } from './clock-out.service.interface.js';
import { ClockOutService } from './clock-out.service.js';
import { PunchesController } from './punches.controller.js';
import { PUNCH_REPOSITORY } from './punch.repository.interface.js';
import { PunchRepository } from './punch.repository.js';
import { TODAY_STATE_SERVICE } from './today-state.service.interface.js';
import { TodayStateService } from './today-state.service.js';
import { TODAY_STATE_READER } from './today-state.repository.interface.js';
import { TodayStateRepository } from './today-state.repository.js';

@Module({
  controllers: [PunchesController],
  providers: [
    { provide: CLOCK_IN_SERVICE, useClass: ClockInService },
    { provide: CLOCK_OUT_SERVICE, useClass: ClockOutService },
    { provide: PUNCH_REPOSITORY, useClass: PunchRepository },
    { provide: TODAY_STATE_SERVICE, useClass: TodayStateService },
    { provide: TODAY_STATE_READER, useClass: TodayStateRepository },
  ],
})
export class PunchesModule {}
