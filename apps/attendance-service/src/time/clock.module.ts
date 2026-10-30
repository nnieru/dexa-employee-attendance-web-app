import { CLOCK, SystemClock } from '@dexa/common';
import { Global, Module } from '@nestjs/common';

// Global, so every feature that stamps a business instant injects the same CLOCK token. Tests override this provider.
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
