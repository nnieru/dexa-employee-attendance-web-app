import {
  loginRequestSchema,
  loginResponseSchema,
  Portal,
  type LoginResponse,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '../types/api-client.js';
import type { LoginFormValues } from '../types/login-form.schema.js';

const LOGIN_PATH = '/auth/login';

export async function postHrLogin(
  apiClient: ApiClient,
  credentials: LoginFormValues,
): Promise<LoginResponse> {
  const body = loginRequestSchema.parse({ ...credentials, portal: Portal.HR });
  const response = await apiClient.post<unknown>(LOGIN_PATH, body);
  return parseResponse(loginResponseSchema, response.data);
}
