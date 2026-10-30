import { Inject, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ACCOUNT_STATUS_READER,
  isPublicRoute,
  JwtAuthGuard,
  type IAccountStatusReader,
} from '@dexa/common';
import { readBearerToken } from './read-bearer-token.js';

/**
 * Global guard for the gateway. It adds two things to the shared JwtAuthGuard: routes marked @Public() skip
 * the check, and a missing Authorization header keeps the sign-in message that /auth/me has always returned.
 * The token and account-status checks are the shared guard's, so the gateway and every service refuse the
 * same requests.
 */
@Injectable()
export class GatewayJwtAuthGuard extends JwtAuthGuard {
  // Nest inherits the base constructor's @Inject entries by parameter index. The reader must stay at index 0,
  // the same index as in JwtAuthGuard, so it does not replace Reflector.
  constructor(
    @Inject(ACCOUNT_STATUS_READER) accountStatuses: IAccountStatusReader,
    private readonly reflector: Reflector,
  ) {
    super(accountStatuses);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) return true;
    const { headers } = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>();
    // A missing or malformed header keeps the sign-in message that /auth/me has always returned.
    readBearerToken(headers.authorization);
    return super.canActivate(context);
  }
}
