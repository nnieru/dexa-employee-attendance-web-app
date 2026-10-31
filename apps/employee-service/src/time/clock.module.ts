import { CLOCK, SystemClock } from '@dexa/common';
import { Global, Module } from '@nestjs/common';

// Global, so the outbox relay and every feature that stamps a time inject the same CLOCK token.
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
