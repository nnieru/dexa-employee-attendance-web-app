import type { AuthenticatedUser } from '@dexa/common';
import type {
  ChangePasswordRequest,
  CurrentAccount,
  LoginRequest,
  LoginResponse,
} from '@dexa/contracts';

/** The gateway's calls into auth-service. Controllers depend on this port, not on the transport. */
export interface IAuthServiceClient {
  createSession(request: LoginRequest): Promise<LoginResponse>;
  findCurrentAccount(user: AuthenticatedUser): Promise<CurrentAccount>;
  changePassword(user: AuthenticatedUser, request: ChangePasswordRequest): Promise<void>;
}

export const AUTH_SERVICE_CLIENT = Symbol('IAuthServiceClient');
