import {
  loginRequestSchema,
  loginResponseSchema,
  type LoginResponse,
  type Portal,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '../session-http-client.js';
import type { LoginFormValues } from './login-form.schema.js';

const LOGIN_PATH = '/auth/login';

export async function postLogin(
  apiClient: ApiClient,
  portal: Portal,
  credentials: LoginFormValues,
): Promise<LoginResponse> {
  const body = loginRequestSchema.parse({ ...credentials, portal });
  const response = await apiClient.post<unknown>(LOGIN_PATH, body);
  return parseResponse(loginResponseSchema, response.data);
}
