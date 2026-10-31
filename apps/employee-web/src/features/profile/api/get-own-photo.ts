import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';
import { z } from 'zod';

const photoBlobSchema = z.instanceof(Blob);

/**
 * Downloads the owner's photo through the shared client, so the Bearer token travels in the Authorization
 * header. The bytes come back as a Blob; the caller turns it into an object URL for display.
 */
export async function getOwnPhoto(apiClient: ApiClient, photoRequestPath: string): Promise<Blob> {
  const response = await apiClient.get<unknown>(photoRequestPath, { responseType: 'blob' });
  return parseResponse(photoBlobSchema, response.data);
}
