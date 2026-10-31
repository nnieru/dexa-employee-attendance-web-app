import { API_PREFIX } from '@dexa/contracts';

const DEFAULT_API_BASE_URL = `/${API_PREFIX}`;

// Same-origin by default, so a reverse proxy serves the web app and the gateway together. A deployment
// whose gateway lives on another origin sets VITE_API_BASE_URL (the gateway must then allow it in CORS_ORIGINS).
const configuredBaseUrl: unknown = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL =
  typeof configuredBaseUrl === 'string' && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : DEFAULT_API_BASE_URL;
