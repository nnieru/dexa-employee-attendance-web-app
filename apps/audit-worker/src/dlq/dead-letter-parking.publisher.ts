import { connect, type ChannelModel, type ConfirmChannel, type Message } from 'amqplib';

type ParkingConnection = {
  readonly connection: ChannelModel;
  readonly channel: ConfirmChannel;
};

/**
 * Publishes a dead-lettered message, unchanged, to the parking queue. The publish is confirmed by the broker
 * before it resolves, so the caller may acknowledge the DLQ delivery only after this succeeds.
 */
export class DeadLetterParkingPublisher {
  private opened: Promise<ParkingConnection> | undefined;

  constructor(
    private readonly url: string,
    private readonly parkedQueue: string,
  ) {}

  async park(message: Message): Promise<void> {
    const { channel } = await this.openChannel();
    // The default exchange does not dead-letter, so the x-death header and every other property are kept as received.
    channel.publish('', this.parkedQueue, message.content, { ...message.properties });
    await channel.waitForConfirms();
  }

  async close(): Promise<void> {
    const opened = this.opened;
    this.opened = undefined;
    if (opened === undefined) {
      return;
    }
    const { connection } = await opened;
    await connection.close();
  }

  // Opens lazily, so a service that never parks a message opens no second connection. A failed open is not cached,
  // so the next park tries again.
  private openChannel(): Promise<ParkingConnection> {
    if (this.opened === undefined) {
      this.opened = this.connect().catch((error: unknown) => {
        this.opened = undefined;
        throw error;
      });
    }
    return this.opened;
  }

  private async connect(): Promise<ParkingConnection> {
    const connection = await connect(this.url);
    const channel = await connection.createConfirmChannel();
    return { connection, channel };
  }
}
