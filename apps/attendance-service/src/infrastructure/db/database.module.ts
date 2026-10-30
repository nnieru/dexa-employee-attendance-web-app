import { createDatabase, type Database } from '@dexa/db';
import { Global, Module } from '@nestjs/common';
import { CONFIG } from '../../config/config.token.js';
import type { AttendanceServiceConfig } from '../../config/attendance-service-config.schema.js';
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
      useFactory: (config: AttendanceServiceConfig): Database =>
        createDatabase(config.ATTENDANCE_DATABASE_URL),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
