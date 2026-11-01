import { parseResponse } from '@dexa/api-client';
import { ownProfileSchema, type OwnProfile, type UpdateOwnProfileRequest } from '@dexa/contracts';
import type { ApiClient } from '@dexa/session';
import { OWN_PROFILE_PATH } from './get-own-profile.js';

/** Sends the phone change; the response is the profile as stored after the change. */
export async function updateOwnPhone(
  apiClient: ApiClient,
  request: UpdateOwnProfileRequest,
): Promise<OwnProfile> {
  const response = await apiClient.patch<unknown>(OWN_PROFILE_PATH, request);
  return parseResponse(ownProfileSchema, response.data);
}
