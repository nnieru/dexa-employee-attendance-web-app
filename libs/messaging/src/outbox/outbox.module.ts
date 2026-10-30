import { CLOCK, type IClock } from '@dexa/common';
import type { Database } from '@dexa/db';
import { Module, type DynamicModule } from '@nestjs/common';
import { EVENT_PUBLISHER, type IEventPublisher } from '../event-publisher.interface.js';
import { OutboxEventRepository } from './outbox-event.repository.js';
import {
  OUTBOX_EVENT_REPOSITORY,
  type IOutboxEventRepository,
} from './outbox-event-repository.interface.js';
import { OutboxRelay } from './outbox-relay.js';
import { resolveOutboxSettings, type OutboxModuleOptions } from './outbox-settings.js';
import { OUTBOX_WRITER } from './outbox-writer.interface.js';
import { OutboxWriter } from './outbox-writer.js';

/**
 * Provides the outbox writer and runs the relay for the owning service. It is global, so feature modules
 * inject OUTBOX_WRITER without importing this module again, which would start a second relay.
 *
 * The service must provide three things that this module injects, each visible to global scope:
 * - its `Database`, under `databaseToken`;
 * - `CLOCK` from @dexa/common;
 * - `EVENT_PUBLISHER`, from `MessagingModule.forRoot`.
 * A missing provider stops startup with Nest's unresolved-dependency error.
 */
@Module({})
export class OutboxModule {
  static forRoot(options: OutboxModuleOptions): DynamicModule {
    const settings = resolveOutboxSettings(options);
    return {
      module: OutboxModule,
      global: true,
      providers: [
        { provide: OUTBOX_WRITER, useClass: OutboxWriter },
        {
          provide: OUTBOX_EVENT_REPOSITORY,
          inject: [options.databaseToken],
          useFactory: (database: Pick<Database, 'db'>): IOutboxEventRepository =>
            new OutboxEventRepository(database),
        },
        {
          provide: OutboxRelay,
          inject: [OUTBOX_EVENT_REPOSITORY, EVENT_PUBLISHER, CLOCK],
          useFactory: (
            repository: IOutboxEventRepository,
            publisher: IEventPublisher,
            clock: IClock,
          ): OutboxRelay => new OutboxRelay({ repository, publisher, clock, settings }),
        },
      ],
      exports: [OUTBOX_WRITER],
    };
  }
}
