import type {
  ApproveCorrectionRequest,
  CorrectionRequest,
  RejectCorrectionRequest,
} from '@dexa/contracts';

export const CORRECTION_REQUEST_DECISION_SERVICE = Symbol('ICorrectionRequestDecisionService');

/** HR approves or rejects a pending correction request. */
export interface ICorrectionRequestDecisionService {
  /** The reviewer comes from the verified token. Rejects with a domain error when the decision is refused. */
  approve(
    reviewerAccountId: string,
    requestId: string,
    input: ApproveCorrectionRequest,
  ): Promise<CorrectionRequest>;
  reject(
    reviewerAccountId: string,
    requestId: string,
    input: RejectCorrectionRequest,
  ): Promise<CorrectionRequest>;
}
