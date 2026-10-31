import {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  type ApiErrorCode,
  FALLBACK_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from './api-error.js';
import { createHttpClient, type HttpClientOptions } from './create-http-client.js';

const BASE_URL = 'https://api.example.test';
const ACCESS_TOKEN = 'access-token-value';

type StubOutcome =
  { kind: 'http'; status: number; data: unknown } | { kind: 'network-error' } | { kind: 'timeout' };

async function respondWith(
  outcome: StubOutcome,
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
  if (outcome.kind === 'network-error')
    throw new AxiosError('Network Error', 'ERR_NETWORK', config);
  if (outcome.kind === 'timeout') {
    throw new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED', config);
  }

  const response: AxiosResponse = {
    data: outcome.data,
    status: outcome.status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
  };
  if (outcome.status < 200 || outcome.status >= 300) {
    throw new AxiosError(
      `Request failed with status code ${outcome.status}`,
      'ERR_BAD_RESPONSE',
      config,
      undefined,
      response,
    );
  }
  return response;
}

/** Replaces the transport with a stub so each test controls the server answer and counts sent requests. */
function createStubbedClient(
  outcome: StubOutcome,
  options: Partial<HttpClientOptions> = {},
): { client: AxiosInstance; sentMethods: string[] } {
  const sentMethods: string[] = [];
  const client = createHttpClient({
    baseUrl: BASE_URL,
    getAccessToken: () => ACCESS_TOKEN,
    ...options,
  });
  client.defaults.adapter = async (config) => {
    sentMethods.push(config.method ?? '');
    return respondWith(outcome, config);
  };
  return { client, sentMethods };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to reject');
}

describe('createHttpClient', () => {
  describe('unauthorized responses', () => {
    it.each<{ code: ApiErrorCode; message: string }>([
      { code: 'ACCOUNT_DISABLED', message: 'This account is no longer active.' },
      { code: 'UNAUTHORIZED', message: 'Sign in again.' },
    ])(
      'should call onUnauthorized with $code and reject with ApiError when the response is 401',
      async ({ code, message }) => {
        const onUnauthorized = vi.fn<(code: ApiErrorCode) => void>();
        const { client } = createStubbedClient(
          { kind: 'http', status: 401, data: { statusCode: 401, code, message } },
          { onUnauthorized },
        );

        const error = await captureError(client.get('/attendance/me/today'));

        expect(onUnauthorized).toHaveBeenCalledTimes(1);
        expect(onUnauthorized).toHaveBeenCalledWith(code);
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 401, code, message });
      },
    );

    it('should call onUnauthorized with INTERNAL_ERROR when the 401 body is unreadable', async () => {
      const onUnauthorized = vi.fn<(code: ApiErrorCode) => void>();
      const { client } = createStubbedClient(
        { kind: 'http', status: 401, data: 'not json' },
        { onUnauthorized },
      );

      const error = await captureError(client.get('/attendance/me/today'));

      expect(onUnauthorized).toHaveBeenCalledWith('INTERNAL_ERROR');
      expect(error).toMatchObject({
        status: 401,
        code: 'INTERNAL_ERROR',
        message: FALLBACK_ERROR_MESSAGE,
      });
    });

    it.each([403, 404, 409, 500])(
      'should not call onUnauthorized when the response is %i',
      async (status) => {
        const onUnauthorized = vi.fn<(code: ApiErrorCode) => void>();
        const { client } = createStubbedClient(
          {
            kind: 'http',
            status,
            data: { statusCode: status, code: 'CONFLICT', message: 'Conflict.' },
          },
          { onUnauthorized },
        );

        await captureError(client.get('/employees'));

        expect(onUnauthorized).not.toHaveBeenCalled();
      },
    );
  });

  describe('error response mapping', () => {
    it.each([
      { status: 403, code: 'FORBIDDEN', message: 'You do not have access to this record.' },
      { status: 404, code: 'NOT_FOUND', message: 'Employee not found.' },
      {
        status: 409,
        code: 'ATTENDANCE_ALREADY_CLOCKED_IN',
        message: 'You have already clocked in today.',
      },
    ])(
      'should map a $status $code body to ApiError with its status, code and message',
      async ({ status, code, message }) => {
        const { client } = createStubbedClient({
          kind: 'http',
          status,
          data: { statusCode: status, code, message },
        });

        const error = await captureError(client.get('/employees/unknown'));

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status, code, message });
      },
    );

    it('should use INTERNAL_ERROR with the real status when the body is not JSON', async () => {
      const { client } = createStubbedClient({
        kind: 'http',
        status: 502,
        data: '<html>Bad gateway from upstream</html>',
      });

      const error = await captureError(client.get('/employees'));

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 502,
        code: 'INTERNAL_ERROR',
        message: FALLBACK_ERROR_MESSAGE,
      });
      expect(JSON.stringify(error)).not.toContain('Bad gateway');
    });

    it('should use INTERNAL_ERROR with the real status when the body is missing required fields', async () => {
      const { client } = createStubbedClient({
        kind: 'http',
        status: 500,
        data: { error: 'Upstream failed', stack: 'secret stack' },
      });

      const error = await captureError(client.get('/employees'));

      expect(error).toMatchObject({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: FALLBACK_ERROR_MESSAGE,
      });
      expect(JSON.stringify(error)).not.toContain('secret stack');
    });

    it('should use INTERNAL_ERROR when the server code is not in ErrorCode', async () => {
      const { client } = createStubbedClient({
        kind: 'http',
        status: 409,
        data: { statusCode: 409, code: 'SOME_NEWER_CONFLICT', message: 'A newer conflict.' },
      });

      const error = await captureError(client.get('/employees'));

      expect(error).toMatchObject({
        status: 409,
        code: 'INTERNAL_ERROR',
        message: 'A newer conflict.',
      });
    });

    it('should not expose the request config or the access token when the request fails', async () => {
      const { client } = createStubbedClient({
        kind: 'http',
        status: 500,
        data: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
      });

      const error = await captureError(client.get('/employees'));

      expect(error).not.toHaveProperty('config');
      expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
    });
  });

  describe('transport failures', () => {
    it.each<{ name: string; outcome: StubOutcome }>([
      { name: 'network error', outcome: { kind: 'network-error' } },
      { name: 'timeout', outcome: { kind: 'timeout' } },
    ])(
      'should map a $name to ApiError with status 0 and a generic message',
      async ({ outcome }) => {
        const { client } = createStubbedClient(outcome);

        const error = await captureError(client.get('/employees'));

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
          status: 0,
          code: 'INTERNAL_ERROR',
          message: NETWORK_ERROR_MESSAGE,
        });
        expect(error).not.toHaveProperty('config');
        expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
        expect(String(error)).not.toContain(BASE_URL);
      },
    );

    it('should not call onUnauthorized when the request fails without a response', async () => {
      const onUnauthorized = vi.fn<(code: ApiErrorCode) => void>();
      const { client } = createStubbedClient({ kind: 'network-error' }, { onUnauthorized });

      await captureError(client.get('/employees'));

      expect(onUnauthorized).not.toHaveBeenCalled();
    });
  });

  describe('retries', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
      'should send %s once when the server answers 503',
      async (method) => {
        const { client, sentMethods } = createStubbedClient({
          kind: 'http',
          status: 503,
          data: { statusCode: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'Try later.' },
        });

        await captureError(client.request({ method, url: '/attendance/clock-in' }));

        expect(sentMethods).toEqual([method.toLowerCase()]);
      },
    );

    it('should send POST once when the network fails', async () => {
      const { client, sentMethods } = createStubbedClient({ kind: 'network-error' });

      await captureError(client.post('/attendance/clock-in'));

      expect(sentMethods).toEqual(['post']);
    });
  });
});
