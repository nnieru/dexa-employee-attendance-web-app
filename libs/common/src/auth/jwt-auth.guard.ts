import { Inject, Injectable, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '@dexa/contracts';
import { UnauthorizedError } from '../errors/domain.errors.js';
import {
  ACCOUNT_STATUS_READER,
  type IAccountStatusReader,
} from './account-status-reader.interface.js';
import { authenticatedUserSchema } from './authenticated-principal.js';
import { USER_JWT_STRATEGY_NAME } from './user-jwt.strategy.js';

const SIGN_IN_MESSAGE = 'Sign in to continue.';
const ACCOUNT_DISABLED_MESSAGE = 'This account is no longer active.';

/**
 * Requires a valid end-user token and an account that is still active. Only api-gateway uses it (D-51), so the
 * status check runs once per request at the edge. Handlers read the caller's identity with @CurrentUser(). The
 * check runs on every request with no cache. A reader failure propagates: the request is refused, never allowed.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(USER_JWT_STRATEGY_NAME) {
  constructor(
    @Inject(ACCOUNT_STATUS_READER) private readonly accountStatuses: IAccountStatusReader,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isTokenValid = await super.canActivate(context);
    if (!isTokenValid) return false;

    const user = authenticatedUserSchema.safeParse(
      context.switchToHttp().getRequest<{ user?: unknown }>().user,
    );
    if (!user.success) throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, SIGN_IN_MESSAGE);

    await this.assertAccountIsActive(user.data.accountId);
    return true;
  }

  private async assertAccountIsActive(accountId: string): Promise<void> {
    const status = await this.accountStatuses.findAccountStatus(accountId);
    // An account that no longer exists is refused like an invalid token.
    if (status === undefined) throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, SIGN_IN_MESSAGE);
    if (!status.isActive) {
      throw new UnauthorizedError(ErrorCode.ACCOUNT_DISABLED, ACCOUNT_DISABLED_MESSAGE);
    }
  }
}
