import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { readLoginRequest } from './read-login-request.js';

/**
 * Checks the sign-in body before LocalAuthGuard runs. Guards run in the order they are listed, and
 * passport-local answers a missing email or password with 401, so a malformed request would otherwise
 * look like wrong credentials. Pipes run only after every guard, which is why this check is a guard.
 */
@Injectable()
export class LoginRequestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    readLoginRequest(context.switchToHttp().getRequest<{ readonly body: unknown }>().body);
    return true;
  }
}
