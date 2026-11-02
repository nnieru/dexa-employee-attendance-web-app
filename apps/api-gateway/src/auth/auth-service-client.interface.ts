import type { AuthenticatedUser } from '@dexa/common';
import type {
  ChangePasswordRequest,
  CreateSessionResponse,
  CurrentAccount,
  LoginRequest,
} from '@dexa/contracts';

/** The gateway's calls into auth-service. Controllers depend on this port, not on the transport. */
export interface IAuthServiceClient {
  createSession(request: LoginRequest): Promise<CreateSessionResponse>;
  refreshSession(refreshToken: string): Promise<CreateSessionResponse>;
  findCurrentAccount(user: AuthenticatedUser): Promise<CurrentAccount>;
  changePassword(user: AuthenticatedUser, request: ChangePasswordRequest): Promise<void>;
}

export const AUTH_SERVICE_CLIENT = Symbol('IAuthServiceClient');
