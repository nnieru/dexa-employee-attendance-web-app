import type { CorrectionRequest, SubmitCorrectionRequest } from '@dexa/contracts';

export const CORRECTION_REQUEST_SERVICE = Symbol('ICorrectionRequestService');

/** The saved correction, and whether this call created it (201) or returned the one an identical retry had saved (200). */
export type SubmitCorrectionRequestResult = {
  readonly created: boolean;
  readonly request: CorrectionRequest;
};

/** Records the signed-in employee's correction request for one business date (COR-1..COR-4, APR-5). */
export interface ICorrectionRequestService {
  /** The account comes from the verified token. Rejects with a domain error when the request is refused. */
  submit(
    accountId: string,
    request: SubmitCorrectionRequest,
  ): Promise<SubmitCorrectionRequestResult>;
}
