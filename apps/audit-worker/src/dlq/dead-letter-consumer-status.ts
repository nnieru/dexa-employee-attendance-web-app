import { Injectable } from '@nestjs/common';

/**
 * Whether the archive consumer is paused after a transient failure. The consumer server writes it and the
 * health indicator reads it. The read side has no setter, so health cannot change the consumer's state.
 */
@Injectable()
export class DeadLetterConsumerStatus {
  private paused = false;

  get isPaused(): boolean {
    return this.paused;
  }

  markPaused(): void {
    this.paused = true;
  }

  markResumed(): void {
    this.paused = false;
  }
}
