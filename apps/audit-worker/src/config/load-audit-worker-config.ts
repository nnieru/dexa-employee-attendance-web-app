import { parseConfig } from '@dexa/common';
import { AuditWorkerConfigSchema, type AuditWorkerConfig } from './audit-worker-config.schema.js';

/** Reads this service's settings from the environment and fails startup when any of them is invalid. */
export function loadAuditWorkerConfig(): AuditWorkerConfig {
  return parseConfig(AuditWorkerConfigSchema);
}
