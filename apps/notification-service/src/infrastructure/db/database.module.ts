import { createDatabase, type Database } from '@dexa/db';
import { Global, Module } from '@nestjs/common';
import { CONFIG } from '../../config/config.token.js';
import type { NotificationServiceConfig } from '../../config/notification-service-config.schema.js';
import { DatabaseLifecycle } from './database.lifecycle.js';
import { DATABASE } from './database.token.js';

// Global, so the notification repository can inject the pool without re-importing this module.
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [CONFIG],
      // Building the pool opens no connection; the first connection happens in the init hook.
      useFactory: (config: NotificationServiceConfig): Database =>
        createDatabase(config.NOTIFICATION_DATABASE_URL),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
