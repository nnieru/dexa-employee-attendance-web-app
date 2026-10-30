import { parseConfig } from '@dexa/common';
import {
  EmployeeServiceConfigSchema,
  type EmployeeServiceConfig,
} from './employee-service-config.schema.js';

/** Reads this service's settings from the environment. The schema refuses an invalid start. */
export function loadEmployeeServiceConfig(): EmployeeServiceConfig {
  return parseConfig(EmployeeServiceConfigSchema);
}
