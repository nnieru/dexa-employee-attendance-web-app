import { Injectable } from '@nestjs/common';
import type { IClock } from './clock.interface.js';

/** The one place that reads the wall clock. Business code receives IClock through the CLOCK token. */
@Injectable()
export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
