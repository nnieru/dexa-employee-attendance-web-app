import { Module, type DynamicModule } from '@nestjs/common';
import { EVENT_PUBLISHER, type IEventPublisher } from './event-publisher.interface.js';
import { RmqEventPublisher, createEventPublisherClient } from './rmq-event-publisher.js';

export type MessagingModuleOptions = {
  readonly url: string;
};

@Module({})
export class MessagingModule {
  // The owning service passes in the broker URL from its validated config. The publisher connects on its
  // first publish, so a service that never publishes never opens a broker connection.
  // Global, so the one publisher per service is injectable where OutboxModule needs it. Importing forRoot
  // twice would create a second publisher and a second broker connection.
  static forRoot(options: MessagingModuleOptions): DynamicModule {
    return {
      module: MessagingModule,
      global: true,
      providers: [
        {
          provide: EVENT_PUBLISHER,
          useFactory: (): IEventPublisher =>
            new RmqEventPublisher(createEventPublisherClient(options.url)),
        },
      ],
      exports: [EVENT_PUBLISHER],
    };
  }
}
