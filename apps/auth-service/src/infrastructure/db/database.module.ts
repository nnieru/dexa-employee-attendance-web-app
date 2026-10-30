import { createDatabase, type Database } from '@dexa/db';
import { Global, Module } from '@nestjs/common';
import type { AuthServiceConfig } from '../../config/auth-service-config.schema.js';
import { CONFIG } from '../../config/config.token.js';
import { DatabaseLifecycle } from './database.lifecycle.js';
import { DATABASE } from './database.token.js';

// Global, so the outbox writer and relay that OutboxModule declares can inject the pool.
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [CONFIG],
      // Building the pool opens no connection; the first connection happens in the init hook.
      useFactory: (config: AuthServiceConfig): Database => createDatabase(config.AUTH_DATABASE_URL),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
