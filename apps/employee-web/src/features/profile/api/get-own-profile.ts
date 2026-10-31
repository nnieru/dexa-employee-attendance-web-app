import { parseResponse } from '@dexa/api-client';
import { ownProfileSchema, type OwnProfile } from '@dexa/contracts';
import type { ApiClient } from '@dexa/session';

const OWN_PROFILE_PATH = '/employees/me';

export async function getOwnProfile(apiClient: ApiClient): Promise<OwnProfile> {
  const response = await apiClient.get<unknown>(OWN_PROFILE_PATH);
  return parseResponse(ownProfileSchema, response.data);
}
