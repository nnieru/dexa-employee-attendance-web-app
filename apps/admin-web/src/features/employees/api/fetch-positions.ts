import { masterOptionListSchema, type MasterOption } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const POSITIONS_PATH = '/positions';

export async function fetchPositions(apiClient: ApiClient): Promise<ReadonlyArray<MasterOption>> {
  const response = await apiClient.get<unknown>(POSITIONS_PATH);
  return parseResponse(masterOptionListSchema, response.data);
}
