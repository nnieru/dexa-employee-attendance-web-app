import { DomainError } from '@dexa/common';
import { Role } from '@dexa/contracts';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { setTimeout as waitForDelay } from 'node:timers/promises';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../auth-accounts/auth-account-client.interface.js';
import { CONFIG } from '../config/config.token.js';
import type { EmployeeServiceConfig } from '../config/employee-service-config.schema.js';
import {
  MASTER_DATA_SEEDER,
  type IMasterDataSeeder,
} from '../master-data/master-data-seeder.interface.js';
import { calculateProfileStatus } from '../profile/profile-completion.rules.js';
import {
  HR_BOOTSTRAP_RETRY_POLICY,
  type HrBootstrapRetryPolicy,
} from './hr-bootstrap-retry-policy.interface.js';
import { resolveHrBootstrapSettings, type HrBootstrapSettings } from './hr-bootstrap-settings.js';
import {
  HR_PROFILE_REPOSITORY,
  type HrProfileInsertOutcome,
  type IHrProfileRepository,
  type NewHrProfile,
} from './hr-profile.repository.interface.js';

// The master status that a bootstrap HR profile starts in (DATABASE §4).
const ACTIVE_EMPLOYEE_STATUS_CODE = 'ACTIVE';

export type HrProfileBootstrapOutcome =
  'NOT_CONFIGURED' | 'CREATED' | 'ALREADY_PRESENT' | 'CONFIGURATION_REJECTED' | 'STOPPED';

type AttemptResult =
  | { readonly kind: 'FINISHED'; readonly outcome: HrProfileBootstrapOutcome }
  | { readonly kind: 'RETRY' };

const RETRY: AttemptResult = { kind: 'RETRY' };

function finished(outcome: HrProfileBootstrapOutcome): AttemptResult {
  return { kind: 'FINISHED', outcome };
}

/**
 * Creates the bootstrap HR's employee profile (DATABASE §3.3, decided v1.11). Startup does not wait on Auth:
 * the attempts run in the background, retrying with bounded backoff until they finish or the app shuts down.
 * The profile is created once. A restart finds it and changes nothing. No event is published, because the
 * initial creation has no agreed event contract.
 */
@Injectable()
export class HrProfileBootstrapService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HrProfileBootstrapService.name);
  private readonly shutdown = new AbortController();
  private settlement: Promise<HrProfileBootstrapOutcome> | undefined;

  constructor(
    @Inject(CONFIG) private readonly config: EmployeeServiceConfig,
    @Inject(MASTER_DATA_SEEDER) private readonly masterDataSeeder: IMasterDataSeeder,
    @Inject(AUTH_ACCOUNT_CLIENT) private readonly authAccounts: IAuthAccountClient,
    @Inject(HR_PROFILE_REPOSITORY) private readonly profiles: IHrProfileRepository,
    @Inject(HR_BOOTSTRAP_RETRY_POLICY) private readonly retryPolicy: HrBootstrapRetryPolicy,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const settings = resolveHrBootstrapSettings(this.config);
    if (settings === undefined) {
      this.logger.log(
        'HR profile bootstrap is not configured. No HR profile is created at startup.',
      );
      this.settlement = Promise.resolve('NOT_CONFIGURED');
      return;
    }
    // The attempts look up the position and status rows that the master seed writes. Waiting for the seed
    // here keeps that order fixed. It only touches the database, so startup still does not wait on Auth.
    await this.masterDataSeeder.ensureSeeded();
    this.settlement = this.attemptUntilSettled(settings);
  }

  onModuleDestroy(): void {
    this.shutdown.abort();
  }

  /**
   * Resolves with the outcome of the background attempts. Startup never awaits it. Tests and operators use it
   * to observe the result without polling the database. It throws when the bootstrap has not started yet.
   */
  whenSettled(): Promise<HrProfileBootstrapOutcome> {
    if (this.settlement === undefined) {
      throw new Error('The HR profile bootstrap has not started.');
    }
    return this.settlement;
  }

  // Attempts never overlap, because each waits for the previous attempt before it sleeps and tries again.
  private async attemptUntilSettled(
    settings: HrBootstrapSettings,
  ): Promise<HrProfileBootstrapOutcome> {
    let delayMilliseconds = this.retryPolicy.initialDelayMilliseconds;
    while (!this.shutdown.signal.aborted) {
      const result = await this.attemptOnce(settings);
      if (result.kind === 'FINISHED') return result.outcome;
      await sleepUnlessShutdown(delayMilliseconds, this.shutdown.signal);
      delayMilliseconds = Math.min(delayMilliseconds * 2, this.retryPolicy.maxDelayMilliseconds);
    }
    return 'STOPPED';
  }

  private async attemptOnce(settings: HrBootstrapSettings): Promise<AttemptResult> {
    try {
      return await this.createProfileIfAbsent(settings);
    } catch (error: unknown) {
      // Retrying is safe because the insert is idempotent. The log names the error code only, since a message
      // can carry detail from the failed call.
      this.logger.warn(
        `HR profile bootstrap attempt failed (${describeFailure(error)}). Retrying.`,
      );
      return RETRY;
    }
  }

  private async createProfileIfAbsent(settings: HrBootstrapSettings): Promise<AttemptResult> {
    const account = await this.authAccounts.findAccountReferenceByEmail(settings.email);
    if (account === undefined) {
      this.logger.warn(
        'No account uses the configured bootstrap HR email yet. Auth may still be creating it. Retrying.',
      );
      return RETRY;
    }
    // A mismatch is a configuration error, so retrying cannot fix it. The attempts stop instead.
    if (account.role !== Role.HR) {
      this.logger.error(
        'The configured bootstrap HR email belongs to an account that does not have the HR role. No HR profile is created. Correct the configuration and restart.',
      );
      return finished('CONFIGURATION_REJECTED');
    }
    const positionId = await this.findActivePositionId(settings.positionCode);
    const employeeStatusId = await this.findActiveEmployeeStatusId();
    if (positionId === undefined || employeeStatusId === undefined) {
      return finished('CONFIGURATION_REJECTED');
    }
    // The shutdown check comes before the write, so an app that is closing does not start a new insert.
    if (this.shutdown.signal.aborted) return finished('STOPPED');

    const profile: NewHrProfile = {
      accountId: account.id,
      name: settings.name,
      positionId,
      employeeStatusId,
      // A new profile has no phone or photo, so the derived status is INCOMPLETE (DATABASE §4.1).
      profileStatus: calculateProfileStatus({
        name: settings.name,
        positionId,
        phoneNumber: null,
        photoKey: null,
      }),
    };
    return this.recordInsertOutcome(await this.profiles.insertProfileIfAbsent(profile));
  }

  private recordInsertOutcome(outcome: HrProfileInsertOutcome): AttemptResult {
    if (outcome === 'CREATED') {
      this.logger.log(
        'Created the employee profile for the bootstrap HR account with status ACTIVE.',
      );
      return finished('CREATED');
    }
    this.logger.log(
      'The employee profile for the bootstrap HR account already exists. It was not changed.',
    );
    return finished('ALREADY_PRESENT');
  }

  private async findActivePositionId(positionCode: string): Promise<string | undefined> {
    const position = await this.profiles.findPositionByCode(positionCode);
    if (position?.isActive === true) return position.id;
    this.logger.error(
      'The configured bootstrap HR position code does not match an active position. No HR profile is created. Correct the configuration and restart.',
    );
    return undefined;
  }

  private async findActiveEmployeeStatusId(): Promise<string | undefined> {
    const status = await this.profiles.findEmployeeStatusByCode(ACTIVE_EMPLOYEE_STATUS_CODE);
    if (status?.isActive === true) return status.id;
    this.logger.error(
      'The ACTIVE employee status is missing or inactive in the master data. No HR profile is created. Correct the master data and restart.',
    );
    return undefined;
  }
}

// Aborting the signal rejects the timer, which is how a shutdown interrupts a wait. The loop reads the signal
// to decide what happens next, so the rejection is expected and dropped here. Any other failure is rethrown.
async function sleepUnlessShutdown(delayMilliseconds: number, signal: AbortSignal): Promise<void> {
  try {
    await waitForDelay(delayMilliseconds, undefined, { signal });
  } catch (error: unknown) {
    if (!signal.aborted) throw error;
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof DomainError) return error.code;
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
}
