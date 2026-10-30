import { Module } from '@nestjs/common';
import { AuthAccountsModule } from '../auth-accounts/auth-accounts.module.js';
import { EMPLOYEE_PROFILE_READER } from './employee-profile.reader.interface.js';
import { EmployeeProfileRepository } from './employee-profile.repository.js';
import { EMPLOYEE_PROFILE_WRITER } from './employee-profile.writer.interface.js';
import { EmployeeProfileWriter } from './employee-profile.writer.repository.js';
import { OWN_PHONE_SERVICE } from './own-phone.service.interface.js';
import { OwnPhoneService } from './own-phone.service.js';
import { OWN_PROFILE_SERVICE } from './own-profile.service.interface.js';
import { OwnProfileController } from './own-profile.controller.js';
import { OwnProfileService } from './own-profile.service.js';

// The reader and writer ports are exported for the photo feature, which writes the same employee row.
@Module({
  imports: [AuthAccountsModule],
  controllers: [OwnProfileController],
  providers: [
    { provide: OWN_PROFILE_SERVICE, useClass: OwnProfileService },
    { provide: OWN_PHONE_SERVICE, useClass: OwnPhoneService },
    { provide: EMPLOYEE_PROFILE_READER, useClass: EmployeeProfileRepository },
    { provide: EMPLOYEE_PROFILE_WRITER, useClass: EmployeeProfileWriter },
  ],
  exports: [OWN_PROFILE_SERVICE, EMPLOYEE_PROFILE_READER, EMPLOYEE_PROFILE_WRITER],
})
export class ProfileModule {}
