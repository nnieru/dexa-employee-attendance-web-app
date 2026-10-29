/** Broker-agnostic contract. The amqplib implementation is added when the first event flow needs it. */
export type EventMessage = {
  eventId: string;
  type: string;
  occurredAt: string;
  payload: unknown;
};

export interface EventPublisher {
  publish(message: EventMessage): Promise<void>;
}

export interface EventConsumer {
  consume(queue: string, handler: (message: EventMessage) => Promise<void>): Promise<void>;
}
