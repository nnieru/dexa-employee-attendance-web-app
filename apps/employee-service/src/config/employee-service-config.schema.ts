import { BaseConfigSchema } from '@dexa/common';
import { z } from 'zod';
import { resolveMasterDataSetting, type MasterDataDocument } from './master-data-setting.schema.js';

// pg silently falls back to local defaults for a missing host or database name, so both are
// required here. Otherwise a bad URL would only surface at the first query.
const postgresUrlSchema = z
  .url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// connection URL',
  })
  .pipe(z.string().refine(hasHostAndDatabase, { error: 'must name a host and a database' }));

function hasHostAndDatabase(value: string): boolean {
  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  return url.hostname !== '' && databaseName !== '';
}

// A blank variable counts as unset, so an empty line in .env or compose means "not configured".
function treatBlankAsUnset(value: unknown): unknown {
  return value === '' ? undefined : value;
}

const employeeServiceEnvironmentSchema = BaseConfigSchema.extend({
  EMPLOYEE_DATABASE_URL: postgresUrlSchema,
  EMPLOYEE_MASTER_DATA: z.preprocess(treatBlankAsUnset, z.string().optional()),
});

// The master data setting depends on NODE_ENV, so it is resolved after the other variables parse.
export const EmployeeServiceConfigSchema = employeeServiceEnvironmentSchema.transform(
  (environment, context) => {
    const masterData: MasterDataDocument | undefined = resolveMasterDataSetting(
      environment.NODE_ENV,
      environment.EMPLOYEE_MASTER_DATA,
      context,
    );
    return { ...environment, EMPLOYEE_MASTER_DATA: masterData };
  },
);

export type EmployeeServiceConfig = z.infer<typeof EmployeeServiceConfigSchema>;
