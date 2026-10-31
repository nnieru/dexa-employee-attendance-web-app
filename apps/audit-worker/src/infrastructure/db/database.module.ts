import { createDatabase, type Database } from '@dexa/db';
import { Global, Module } from '@nestjs/common';
import { CONFIG } from '../../config/config.token.js';
import type { AuditWorkerConfig } from '../../config/audit-worker-config.schema.js';
import { DatabaseLifecycle } from './database.lifecycle.js';
import { DATABASE } from './database.token.js';

// Global, so the audit repository can inject the pool without re-importing this module.
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [CONFIG],
      // Building the pool opens no connection; the first connection happens in the init hook.
      useFactory: (config: AuditWorkerConfig): Database =>
        createDatabase(config.AUDIT_DATABASE_URL),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
