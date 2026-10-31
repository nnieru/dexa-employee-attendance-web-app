import { ServiceName, parseConfig } from '@dexa/common';
import {
  EmployeeServiceConfigSchema,
  type EmployeeServiceConfig,
} from './employee-service-config.schema.js';

/**
 * Reads this service's settings from the environment. A blank or unset SERVICE_NAME means this
 * service's own name, so one shared .env file serves every service. The schema refuses any other value.
 */
export function loadEmployeeServiceConfig(): EmployeeServiceConfig {
  const serviceName = process.env.SERVICE_NAME || ServiceName.EMPLOYEE_SERVICE;
  return parseConfig(EmployeeServiceConfigSchema, {
    ...process.env,
    SERVICE_NAME: serviceName,
  });
}
