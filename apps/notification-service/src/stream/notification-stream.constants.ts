// How often an open stream sends a heartbeat comment. The comment keeps proxies from closing an idle connection.
// The gateway re-checks the account on the same interval and closes the stream when it is deactivated.
// 15 seconds stays under the 60-second idle timeout of common proxies.
export const NOTIFICATION_STREAM_HEARTBEAT_MILLISECONDS = 15_000;

// The interval comes from a provider so the integration tests can use a short one.
export const NOTIFICATION_STREAM_HEARTBEAT = Symbol('NOTIFICATION_STREAM_HEARTBEAT');
