import type { IAccountStatusReader } from '@dexa/common';
import { Logger } from '@nestjs/common';

export type AccountStatusWatchOptions = {
  readonly accountId: string;
  readonly accountStatuses: IAccountStatusReader;
  readonly intervalMilliseconds: number;
  // Called once, when the account is found inactive or its check fails. The watch stops itself first.
  readonly onInactive: () => void;
};

/**
 * Re-checks an open stream's account on a timer, because a stream outlives the request that opened it. The check
 * fails closed: an account that cannot be verified ends the stream, as an inactive one does (D-13). Each check
 * reads auth-service with no cache, the same as JwtAuthGuard does for a request.
 */
export class AccountStatusWatch {
  private readonly logger = new Logger(AccountStatusWatch.name);
  private timer: NodeJS.Timeout | undefined;
  private isChecking = false;

  constructor(private readonly options: AccountStatusWatchOptions) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.check();
    }, this.options.intervalMilliseconds);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  // One check at a time: a slow auth-service must not stack checks behind the timer.
  private async check(): Promise<void> {
    if (this.isChecking || this.timer === undefined) return;
    this.isChecking = true;
    try {
      const isActive = await this.isAccountActive();
      if (!isActive && this.timer !== undefined) {
        this.stop();
        this.options.onInactive();
      }
    } finally {
      this.isChecking = false;
    }
  }

  private async isAccountActive(): Promise<boolean> {
    try {
      const status = await this.options.accountStatuses.findAccountStatus(this.options.accountId);
      return status?.isActive === true;
    } catch (error: unknown) {
      // Only the error's name is logged: its message can carry the request URL.
      const reason = error instanceof Error ? error.name : 'unknown error';
      this.logger.warn(`Closing a notification stream after its account check failed (${reason}).`);
      return false;
    }
  }
}
