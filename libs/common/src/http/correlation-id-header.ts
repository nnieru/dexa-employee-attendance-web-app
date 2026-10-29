// Read by the exception filter and forwarded by internal calls, so one request keeps one ID
// across services.
export const CORRELATION_ID_HEADER = 'x-correlation-id';
