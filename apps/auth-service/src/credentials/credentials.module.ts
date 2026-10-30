import { Module } from '@nestjs/common';
import { Argon2PasswordHasher } from './argon2-password.hasher.js';
import { PASSWORD_HASHER } from './password-hasher.interface.js';

@Module({
  providers: [{ provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher }],
  exports: [PASSWORD_HASHER],
})
export class CredentialsModule {}
