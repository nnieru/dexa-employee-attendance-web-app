import { createSessionResponseSchema, type CreateSessionResponse } from '@dexa/contracts';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Reads the session that LocalStrategy attached to the request. A session that does not match the
 * response schema is a defect in this service, so it is reported as one rather than as a client error.
 */
export const LoginSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CreateSessionResponse => {
    const request = context.switchToHttp().getRequest<{ readonly user?: unknown }>();
    const session = createSessionResponseSchema.safeParse(request.user);
    if (!session.success) throw new Error('The sign-in guard did not attach a session.');
    return session.data;
  },
);
