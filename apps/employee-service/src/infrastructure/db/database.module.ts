import { createDatabase, type Database } from '@dexa/db';
import { Global, Module } from '@nestjs/common';
import type { EmployeeServiceConfig } from '../../config/employee-service-config.schema.js';
import { CONFIG } from '../../config/config.token.js';
import { DatabaseLifecycle } from './database.lifecycle.js';
import { DATABASE } from './database.token.js';

// Global, so repositories in every feature module can inject the pool without re-importing it.
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [CONFIG],
      // Building the pool opens no connection; the first connection happens in the init hook.
      useFactory: (config: EmployeeServiceConfig): Database =>
        createDatabase(config.EMPLOYEE_DATABASE_URL),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
