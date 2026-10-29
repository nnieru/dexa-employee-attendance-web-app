import axios, { type AxiosInstance } from 'axios';

type HttpClientOptions = {
  baseUrl: string;
  /** Reads the in-memory access token at request time. */
  getAccessToken: () => string | null;
};

const REQUEST_TIMEOUT_MS = 10_000;

export function createHttpClient({ baseUrl, getAccessToken }: HttpClientOptions): AxiosInstance {
  const client = axios.create({ baseURL: baseUrl, timeout: REQUEST_TIMEOUT_MS });

  client.interceptors.request.use((request) => {
    const accessToken = getAccessToken();
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
    return request;
  });

  return client;
}
