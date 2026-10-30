import { Module } from '@nestjs/common';
import { CLOCK_IN_SERVICE } from './clock-in.service.interface.js';
import { ClockInService } from './clock-in.service.js';
import { PunchesController } from './punches.controller.js';
import { PUNCH_REPOSITORY } from './punch.repository.interface.js';
import { PunchRepository } from './punch.repository.js';

@Module({
  controllers: [PunchesController],
  providers: [
    { provide: CLOCK_IN_SERVICE, useClass: ClockInService },
    { provide: PUNCH_REPOSITORY, useClass: PunchRepository },
  ],
})
export class PunchesModule {}
