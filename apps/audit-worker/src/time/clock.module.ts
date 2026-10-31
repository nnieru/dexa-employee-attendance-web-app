import { CLOCK, SystemClock } from '@dexa/common';
import { Global, Module } from '@nestjs/common';

// Global, so the audit service stamps processed_at through the same CLOCK token that tests can replace.
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
