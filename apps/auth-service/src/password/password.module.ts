import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module.js';
import { DatabaseModule } from '../infrastructure/db/database.module.js';
import { PasswordChangeController } from './password-change.controller.js';
import { PasswordChangeRepository } from './password-change.repository.js';
import { PASSWORD_CHANGE_REPOSITORY } from './password-change.repository.interface.js';
import { PasswordChangeService } from './password-change.service.js';
import { PASSWORD_CHANGE_SERVICE } from './password-change-service.interface.js';

// The outbox writer, the relay, and CLOCK are global (OutboxModule and ClockModule), so they are not
// imported here.
@Module({
  imports: [CredentialsModule, DatabaseModule],
  providers: [
    { provide: PASSWORD_CHANGE_SERVICE, useClass: PasswordChangeService },
    { provide: PASSWORD_CHANGE_REPOSITORY, useClass: PasswordChangeRepository },
  ],
  controllers: [PasswordChangeController],
})
export class PasswordModule {}
