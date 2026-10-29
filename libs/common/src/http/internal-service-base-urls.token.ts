// Injected into the client, so it receives validated URLs and never reads configuration itself.
export const INTERNAL_SERVICE_BASE_URLS = Symbol('InternalServiceBaseUrls');
