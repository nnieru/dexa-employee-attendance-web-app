import { ForbiddenError, ServiceName } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { z } from 'zod';

const employeeServiceCallerSchema = z.object({
  serviceName: z.literal(ServiceName.EMPLOYEE_SERVICE),
});

/**
 * Admits only employee-service. ServiceAuthGuard accepts a valid service token from any service that is
 * addressed to this one, and only employee-service may create the accounts that its profiles depend on.
 */
@Injectable()
export class EmployeeServiceCallerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ readonly user?: unknown }>();
    if (!employeeServiceCallerSchema.safeParse(request.user).success) {
      throw new ForbiddenError(
        ErrorCode.FORBIDDEN,
        'Only the employee service can provision accounts.',
      );
    }
    return true;
  }
}
