import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LOCAL_STRATEGY_NAME } from './local.strategy.js';

/** Checks the email and password in the body through LocalStrategy. */
@Injectable()
export class LocalAuthGuard extends AuthGuard(LOCAL_STRATEGY_NAME) {}
