import type { createHttpClient } from '@dexa/api-client';

// The shared HTTP client. Derived from the factory so features need no direct axios import.
export type ApiClient = ReturnType<typeof createHttpClient>;
