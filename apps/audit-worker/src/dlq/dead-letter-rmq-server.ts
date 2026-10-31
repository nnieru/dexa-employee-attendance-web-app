import { ServerRMQ, type MessageHandler, type RmqOptions } from '@nestjs/microservices';

type RmqConsumerOptions = NonNullable<RmqOptions['options']>;

/**
 * Nest's RMQ server finds a handler by the message's pattern. A dead-lettered body that is not a Nest envelope has
 * no pattern, so the server would nack it without requeue, and the DLQ has no dead-letter exchange to receive it.
 * This server sends every delivery to one catch-all handler instead, whatever its body. It keeps the RMQ
 * transport and its consumer settings from createDeadLetterConsumerOptions.
 */
export class DeadLetterRmqServer extends ServerRMQ {
  constructor(
    options: RmqConsumerOptions,
    private readonly catchAllHandler: MessageHandler,
  ) {
    super(options);
  }

  getHandlerByPattern(): MessageHandler {
    return this.catchAllHandler;
  }
}
