import { Role } from '@dexa/contracts';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { AuthServiceConfig } from '../config/auth-service-config.schema.js';
import { CONFIG } from '../config/config.token.js';
import { PASSWORD_HASHER, type IPasswordHasher } from '../credentials/password-hasher.interface.js';
import { ACCOUNT_REPOSITORY, type IAccountRepository } from './account.repository.interface.js';

// Advisory lock key for the HR bootstrap. Replicas that start together queue on it, so only the
// first one inserts. Any integer works, as long as no other advisory lock in auth_db uses it.
const HR_BOOTSTRAP_LOCK_KEY = 720_416_001;

type HrBootstrapOutcome = 'CREATED' | 'ALREADY_EXISTS';

@Injectable()
export class HrBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HrBootstrapService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AuthServiceConfig,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: IAccountRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
  ) {}

  // Nest runs every OnModuleInit hook before any OnApplicationBootstrap hook, so the migrations
  // that DatabaseLifecycle applies have finished by the time this runs.
  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.AUTH_BOOTSTRAP_HR_EMAIL;
    const password = this.config.AUTH_BOOTSTRAP_HR_PASSWORD;
    // The config schema accepts both values or neither, so an undefined value means neither is set.
    if (email === undefined || password === undefined) {
      await this.warnWhenNoHrAccountExists();
      return;
    }
    // This check runs before hashing, so a restart with an HR account in place does no argon2 work.
    // The check inside the transaction is the one that decides.
    if (await this.accounts.hasAccountWithRole(Role.HR)) {
      this.logger.log('HR account already exists; bootstrap skipped.');
      return;
    }
    const passwordHash = await this.passwordHasher.hash(password);
    const outcome = await this.createHrAccountUnlessPresent(email, passwordHash);
    if (outcome === 'CREATED') {
      this.logger.log('Created the first HR account from the bootstrap configuration.');
    } else {
      this.logger.log('HR account already exists; bootstrap skipped.');
    }
  }

  private createHrAccountUnlessPresent(
    companyEmail: string,
    passwordHash: string,
  ): Promise<HrBootstrapOutcome> {
    return this.accounts.runExclusiveTransaction(
      HR_BOOTSTRAP_LOCK_KEY,
      async (transaction): Promise<HrBootstrapOutcome> => {
        if (await transaction.hasAccountWithRole(Role.HR)) return 'ALREADY_EXISTS';
        await transaction.createAccount({ companyEmail, passwordHash, roleCode: Role.HR });
        return 'CREATED';
      },
    );
  }

  private async warnWhenNoHrAccountExists(): Promise<void> {
    if (await this.accounts.hasAccountWithRole(Role.HR)) return;
    this.logger.warn(
      'No HR account exists and AUTH_BOOTSTRAP_HR_EMAIL and AUTH_BOOTSTRAP_HR_PASSWORD are not set. Set both and restart to create the first HR account.',
    );
  }
}
