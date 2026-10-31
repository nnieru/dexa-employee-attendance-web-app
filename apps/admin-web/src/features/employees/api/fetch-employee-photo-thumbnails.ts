import {
  photoThumbnailResponseSchema,
  type PhotoThumbnailRequest,
  type PhotoThumbnailResponse,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const PHOTO_THUMBNAILS_PATH = '/employees/photo-thumbnails';

export async function fetchEmployeePhotoThumbnails(
  apiClient: ApiClient,
  request: PhotoThumbnailRequest,
): Promise<PhotoThumbnailResponse> {
  const response = await apiClient.post<unknown>(PHOTO_THUMBNAILS_PATH, request);
  return parseResponse(photoThumbnailResponseSchema, response.data);
}
