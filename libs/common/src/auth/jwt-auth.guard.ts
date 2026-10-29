import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { USER_JWT_STRATEGY_NAME } from './user-jwt.strategy.js';

/** Requires a valid user token. Handlers read the caller's identity with @CurrentUser(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard(USER_JWT_STRATEGY_NAME) {}
