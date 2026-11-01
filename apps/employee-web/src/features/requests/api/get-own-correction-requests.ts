import {
  correctionRequestPageSchema,
  type CorrectionRequestPage,
  type OwnRequestListQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const OWN_CORRECTION_REQUESTS_PATH = '/attendance-corrections/me';

export async function getOwnCorrectionRequests(
  apiClient: ApiClient,
  query: OwnRequestListQuery,
): Promise<CorrectionRequestPage> {
  const response = await apiClient.get<unknown>(OWN_CORRECTION_REQUESTS_PATH, { params: query });
  return parseResponse(correctionRequestPageSchema, response.data);
}
