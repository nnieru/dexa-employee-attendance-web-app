import type {
  ApproveOvertimeRequest,
  OvertimeRequest,
  RejectOvertimeRequest,
} from '@dexa/contracts';

export const OVERTIME_REQUEST_DECISION_SERVICE = Symbol('IOvertimeRequestDecisionService');

/** HR approves or rejects a pending overtime request. */
export interface IOvertimeRequestDecisionService {
  /** The reviewer comes from the verified token. Rejects with a domain error when the decision is refused. */
  approve(
    reviewerAccountId: string,
    requestId: string,
    input: ApproveOvertimeRequest,
  ): Promise<OvertimeRequest>;
  reject(
    reviewerAccountId: string,
    requestId: string,
    input: RejectOvertimeRequest,
  ): Promise<OvertimeRequest>;
}
