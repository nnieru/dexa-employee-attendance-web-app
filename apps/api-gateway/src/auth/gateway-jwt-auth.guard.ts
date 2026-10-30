import { Inject, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  authenticatedUserSchema,
  isPublicRoute,
  JwtAuthGuard,
  NotFoundError,
  UnauthorizedError,
} from '@dexa/common';
import { ErrorCode, type AccountStatus } from '@dexa/contracts';
import {
  ACCOUNT_STATUS_CLIENT,
  type IAccountStatusClient,
} from './account-status-client.interface.js';
import { readBearerToken } from './read-bearer-token.js';

const SIGN_IN_MESSAGE = 'Sign in to continue.';
const ACCOUNT_DISABLED_MESSAGE = 'This account is no longer active.';

/**
 * Global guard for the gateway. It verifies the user token with the shared jwt strategy, then asks
 * auth-service whether the account is still active. The status check runs on every request with no
 * cache, so a deactivated account loses access on its very next call. Routes marked @Public() skip both.
 */
@Injectable()
export class GatewayJwtAuthGuard extends JwtAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCOUNT_STATUS_CLIENT) private readonly accountStatuses: IAccountStatusClient,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) return true;
    // A missing or malformed header keeps the sign-in message that /auth/me has always returned.
    const { headers } = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>();
    readBearerToken(headers.authorization);

    const isTokenValid = await super.canActivate(context);
    if (!isTokenValid) return false;

    const user = authenticatedUserSchema.safeParse(
      context.switchToHttp().getRequest<{ user?: unknown }>().user,
    );
    if (!user.success) throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, SIGN_IN_MESSAGE);

    const status = await this.readAccountStatus(user.data.accountId);
    if (!status.isActive) {
      throw new UnauthorizedError(ErrorCode.ACCOUNT_DISABLED, ACCOUNT_DISABLED_MESSAGE);
    }
    return true;
  }

  // A deleted account is refused like an invalid token. Every other failure, such as auth-service being
  // unreachable, propagates unchanged as a dependency failure: the gateway never fails open.
  private async readAccountStatus(accountId: string): Promise<AccountStatus> {
    try {
      return await this.accountStatuses.getAccountStatus(accountId);
    } catch (error: unknown) {
      if (error instanceof NotFoundError) {
        throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, SIGN_IN_MESSAGE, { cause: error });
      }
      throw error;
    }
  }
}
