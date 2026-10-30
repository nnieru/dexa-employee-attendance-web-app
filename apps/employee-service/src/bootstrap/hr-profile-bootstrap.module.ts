import { Module } from '@nestjs/common';
import { AuthAccountsModule } from '../auth-accounts/auth-accounts.module.js';
import { MasterDataModule } from '../master-data/master-data.module.js';
import {
  HR_BOOTSTRAP_RETRY_POLICY,
  type HrBootstrapRetryPolicy,
} from './hr-bootstrap-retry-policy.interface.js';
import { HR_PROFILE_REPOSITORY } from './hr-profile.repository.interface.js';
import { HrProfileRepository } from './hr-profile.repository.js';
import { HrProfileBootstrapService } from './hr-profile-bootstrap.service.js';

// Retries start at one second and stop doubling at 30 seconds, so a missing Auth account or an Auth outage
// costs a few requests a minute rather than a hot loop.
const DEFAULT_HR_BOOTSTRAP_RETRY_POLICY: HrBootstrapRetryPolicy = {
  initialDelayMilliseconds: 1_000,
  maxDelayMilliseconds: 30_000,
};

@Module({
  imports: [AuthAccountsModule, MasterDataModule],
  providers: [
    { provide: HR_PROFILE_REPOSITORY, useClass: HrProfileRepository },
    { provide: HR_BOOTSTRAP_RETRY_POLICY, useValue: DEFAULT_HR_BOOTSTRAP_RETRY_POLICY },
    HrProfileBootstrapService,
  ],
})
export class HrProfileBootstrapModule {}
