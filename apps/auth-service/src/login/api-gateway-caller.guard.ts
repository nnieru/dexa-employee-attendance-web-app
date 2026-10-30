import { ForbiddenError, ServiceName } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { z } from 'zod';

const apiGatewayCallerSchema = z.object({ serviceName: z.literal(ServiceName.API_GATEWAY) });

/**
 * Admits only api-gateway. ServiceAuthGuard accepts a valid service token from any service that is
 * addressed to this one, so the route checks the caller as well: only the gateway forwards credentials.
 */
@Injectable()
export class ApiGatewayCallerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ readonly user?: unknown }>();
    if (!apiGatewayCallerSchema.safeParse(request.user).success) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN, 'Only the API gateway can open a session.');
    }
    return true;
  }
}
