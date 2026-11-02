import type { OvertimeRequest, SubmitOvertimeRequest } from '@dexa/contracts';

export const OVERTIME_REQUEST_SERVICE = Symbol('IOvertimeRequestService');

/** The saved request, and whether this call created it (201) or returned the one an identical retry had saved (200). */
export type SubmitOvertimeRequestResult = {
  readonly created: boolean;
  readonly request: OvertimeRequest;
};

/** Records the signed-in employee's overtime request for one business date. */
export interface IOvertimeRequestService {
  /** The account comes from the verified token. Rejects with a domain error when the request is refused. */
  submit(accountId: string, request: SubmitOvertimeRequest): Promise<SubmitOvertimeRequestResult>;
}
