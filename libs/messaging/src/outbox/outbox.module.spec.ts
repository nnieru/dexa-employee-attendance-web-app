import { CLOCK, SystemClock } from '@dexa/common';
import { createDatabase, type Database } from '@dexa/db';
import { Global, Module, type DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EVENT_PUBLISHER } from '../event-publisher.interface.js';
import { OUTBOX_WRITER } from './outbox-writer.interface.js';
import { OutboxWriter } from './outbox-writer.js';
import { OutboxModule } from './outbox.module.js';

const DATABASE_TOKEN = Symbol('TEST_DATABASE');
// Building the pool opens no connection, so this URL is never dialed.
const UNUSED_DATABASE_URL = 'postgres://outbox:unused@127.0.0.1:1/outbox';

@Global()
@Module({})
class GlobalProvidersModule {
  static with(
    providers: ReadonlyArray<{ readonly provide: symbol; readonly useValue: unknown }>,
  ): DynamicModule {
    return {
      module: GlobalProvidersModule,
      global: true,
      providers: [...providers],
      exports: providers.map((provider) => provider.provide),
    };
  }
}

describe('OutboxModule.forRoot', () => {
  let database: Database;

  beforeEach(() => {
    database = createDatabase(UNUSED_DATABASE_URL);
  });

  afterEach(async () => {
    await database.close();
  });

  it('should provide the outbox writer when the database, clock, and publisher are globally available', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        GlobalProvidersModule.with([
          { provide: DATABASE_TOKEN, useValue: database },
          { provide: CLOCK, useValue: new SystemClock() },
          { provide: EVENT_PUBLISHER, useValue: { publish: () => Promise.resolve() } },
        ]),
        OutboxModule.forRoot({ databaseToken: DATABASE_TOKEN }),
      ],
    }).compile();

    try {
      expect(moduleRef.get(OUTBOX_WRITER)).toBeInstanceOf(OutboxWriter);
    } finally {
      await moduleRef.close();
    }
  });

  it('should fail to compile when the event publisher is not globally available', async () => {
    const compilation = Test.createTestingModule({
      imports: [
        GlobalProvidersModule.with([
          { provide: DATABASE_TOKEN, useValue: database },
          { provide: CLOCK, useValue: new SystemClock() },
        ]),
        OutboxModule.forRoot({ databaseToken: DATABASE_TOKEN }),
      ],
    }).compile();

    await expect(compilation).rejects.toThrow(/Symbol\(IEventPublisher\)/);
  });

  it('should fail to compile when the database token has no provider', async () => {
    const compilation = Test.createTestingModule({
      imports: [
        GlobalProvidersModule.with([
          { provide: CLOCK, useValue: new SystemClock() },
          { provide: EVENT_PUBLISHER, useValue: { publish: () => Promise.resolve() } },
        ]),
        OutboxModule.forRoot({ databaseToken: DATABASE_TOKEN }),
      ],
    }).compile();

    await expect(compilation).rejects.toThrow(/Symbol\(TEST_DATABASE\)/);
  });
});
