import { z } from 'zod';

// Each name is the issuer, subject, or audience of an internal token. Renaming one invalidates the
// tokens that callers sign for it, so a name changes only in a coordinated release.
export const ServiceName = {
  API_GATEWAY: 'api-gateway',
  AUTH_SERVICE: 'auth-service',
  EMPLOYEE_SERVICE: 'employee-service',
  ATTENDANCE_SERVICE: 'attendance-service',
  NOTIFICATION_SERVICE: 'notification-service',
  AUDIT_WORKER: 'audit-worker',
} as const;

export type ServiceName = (typeof ServiceName)[keyof typeof ServiceName];

export const serviceNameSchema = z.enum(ServiceName, { error: 'must be a known service name' });
