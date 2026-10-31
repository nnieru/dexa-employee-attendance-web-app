import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SERVICE_JWT_STRATEGY_NAME } from './service-jwt.strategy.js';

/**
 * Requires a service token addressed to this service. Use it on internal routes only. A token that names a user is
 * refused here, because a user credential is never a service credential (D-51).
 */
@Injectable()
export class ServiceAuthGuard extends AuthGuard(SERVICE_JWT_STRATEGY_NAME) {}
