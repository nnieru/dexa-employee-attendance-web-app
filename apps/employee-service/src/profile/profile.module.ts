import { Module } from '@nestjs/common';
import { AuthAccountsModule } from '../auth-accounts/auth-accounts.module.js';
import { EMPLOYEE_PROFILE_READER } from './employee-profile.reader.interface.js';
import { EmployeeProfileRepository } from './employee-profile.repository.js';
import { OWN_PROFILE_SERVICE } from './own-profile.service.interface.js';
import { OwnProfileController } from './own-profile.controller.js';
import { OwnProfileService } from './own-profile.service.js';

@Module({
  imports: [AuthAccountsModule],
  controllers: [OwnProfileController],
  providers: [
    { provide: OWN_PROFILE_SERVICE, useClass: OwnProfileService },
    { provide: EMPLOYEE_PROFILE_READER, useClass: EmployeeProfileRepository },
  ],
})
export class ProfileModule {}
