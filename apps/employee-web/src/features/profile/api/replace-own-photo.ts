import { parseResponse } from '@dexa/api-client';
import { ownProfileSchema, PHOTO_FIELD_NAME, type OwnProfile } from '@dexa/contracts';
import type { ApiClient } from '@dexa/session';
import { OWN_PROFILE_PATH } from './get-own-profile.js';

const OWN_PHOTO_PATH = `${OWN_PROFILE_PATH}/photo`;

/**
 * Uploads the photo as multipart in the field the server reads. The browser sets the multipart boundary,
 * so the request carries no JSON content type. The response is the profile as stored after the change.
 */
export async function replaceOwnPhoto(apiClient: ApiClient, photo: File): Promise<OwnProfile> {
  const body = new FormData();
  body.append(PHOTO_FIELD_NAME, photo);
  const response = await apiClient.put<unknown>(OWN_PHOTO_PATH, body);
  return parseResponse(ownProfileSchema, response.data);
}
