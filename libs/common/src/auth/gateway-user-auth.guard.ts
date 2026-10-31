import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GATEWAY_USER_JWT_STRATEGY_NAME } from './gateway-user-jwt.strategy.js';

/**
 * Requires a user that api-gateway verified and vouched for, and sets the same request user that JwtAuthGuard
 * sets, so @CurrentUser() and RolesGuard work unchanged. Use it on routes that serve end users. The gateway
 * already checked the account status before forwarding, so this guard does not call auth-service.
 */
@Injectable()
export class GatewayUserAuthGuard extends AuthGuard(GATEWAY_USER_JWT_STRATEGY_NAME) {}
