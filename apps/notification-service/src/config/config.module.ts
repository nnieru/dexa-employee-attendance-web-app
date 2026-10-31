import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { NotificationServiceConfig } from './notification-service-config.schema.js';
import { CONFIG } from './config.token.js';

/**
 * Makes the validated config available to every module. The config is parsed before the module graph
 * is built (see createAppModule), so this module only provides the parsed value.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: NotificationServiceConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}
