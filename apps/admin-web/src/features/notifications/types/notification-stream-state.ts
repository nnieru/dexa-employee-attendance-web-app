// 'connecting' until the first answer, 'live' while the stream is open, 'interrupted' while a drop is retried, and
// 'stopped' after a 401 or 403, when the stream is not retried.
export type NotificationStreamState = 'connecting' | 'live' | 'interrupted' | 'stopped';
