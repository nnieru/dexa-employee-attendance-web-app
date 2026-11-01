import {
  evaluateRequestDecision,
  REQUEST_DECISION_VIOLATION,
  REQUEST_STATUS,
  type RequestDecisionInput,
  type RequestDecisionResult,
} from './request-decision.rules.js';

const REQUESTER_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const REVIEWER_ACCOUNT_ID = '0c7d4a52-3f1e-4d8b-9a6c-2b5e7f8a9d01';

type DecisionRow = {
  readonly condition: string;
  readonly result: string;
  readonly input: Omit<RequestDecisionInput, 'requestedByAccountId' | 'reviewerAccountId'> & {
    readonly reviewerIsRequester?: boolean;
  };
  readonly expected: RequestDecisionResult;
};

describe('evaluateRequestDecision', () => {
  it.each<DecisionRow>([
    {
      condition: 'the request is pending and HR approves without a reason',
      result: 'apply the APPROVED decision',
      input: {
        currentStatus: REQUEST_STATUS.PENDING,
        targetStatus: REQUEST_STATUS.APPROVED,
        reviewReason: null,
      },
      expected: { kind: 'apply', nextStatus: REQUEST_STATUS.APPROVED },
    },
    {
      condition: 'the request is pending and HR approves with a reason',
      result: 'apply the APPROVED decision',
      input: {
        currentStatus: REQUEST_STATUS.PENDING,
        targetStatus: REQUEST_STATUS.APPROVED,
        reviewReason: 'Confirmed with the team lead',
      },
      expected: { kind: 'apply', nextStatus: REQUEST_STATUS.APPROVED },
    },
    {
      condition: 'the request is pending and HR rejects with a reason',
      result: 'apply the REJECTED decision',
      input: {
        currentStatus: REQUEST_STATUS.PENDING,
        targetStatus: REQUEST_STATUS.REJECTED,
        reviewReason: 'Overlaps the approved shift',
      },
      expected: { kind: 'apply', nextStatus: REQUEST_STATUS.REJECTED },
    },
    {
      condition: 'the request is pending and HR rejects with no reason',
      result: 'reject the decision as REVIEW_REASON_REQUIRED',
      input: {
        currentStatus: REQUEST_STATUS.PENDING,
        targetStatus: REQUEST_STATUS.REJECTED,
        reviewReason: null,
      },
      expected: { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.REVIEW_REASON_REQUIRED },
    },
    {
      condition: 'the request is pending and HR rejects with a reason of only spaces',
      result: 'reject the decision as REVIEW_REASON_REQUIRED',
      input: {
        currentStatus: REQUEST_STATUS.PENDING,
        targetStatus: REQUEST_STATUS.REJECTED,
        reviewReason: '   ',
      },
      expected: { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.REVIEW_REASON_REQUIRED },
    },
    {
      condition: 'the reviewer is the requester and approves a pending request',
      result: 'reject the decision as SELF_REVIEW_FORBIDDEN',
      input: {
        currentStatus: REQUEST_STATUS.PENDING,
        targetStatus: REQUEST_STATUS.APPROVED,
        reviewReason: null,
        reviewerIsRequester: true,
      },
      expected: { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.SELF_REVIEW_FORBIDDEN },
    },
    {
      condition: 'the reviewer is the requester and rejects with a blank reason',
      result: 'reject the decision as SELF_REVIEW_FORBIDDEN',
      input: {
        currentStatus: REQUEST_STATUS.PENDING,
        targetStatus: REQUEST_STATUS.REJECTED,
        reviewReason: ' ',
        reviewerIsRequester: true,
      },
      expected: { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.SELF_REVIEW_FORBIDDEN },
    },
    {
      condition: 'the request is already APPROVED and HR approves again',
      result: 'replay the recorded APPROVED result',
      input: {
        currentStatus: REQUEST_STATUS.APPROVED,
        targetStatus: REQUEST_STATUS.APPROVED,
        reviewReason: null,
      },
      expected: { kind: 'replay', recordedStatus: REQUEST_STATUS.APPROVED },
    },
    {
      condition: 'the request is already REJECTED and HR rejects again with a reason',
      result: 'replay the recorded REJECTED result',
      input: {
        currentStatus: REQUEST_STATUS.REJECTED,
        targetStatus: REQUEST_STATUS.REJECTED,
        reviewReason: 'Overlaps the approved shift',
      },
      expected: { kind: 'replay', recordedStatus: REQUEST_STATUS.REJECTED },
    },
    {
      condition: 'the request is already REJECTED and the retry carries a blank reason',
      result: 'reject the decision as REVIEW_REASON_REQUIRED',
      input: {
        currentStatus: REQUEST_STATUS.REJECTED,
        targetStatus: REQUEST_STATUS.REJECTED,
        reviewReason: '',
      },
      expected: { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.REVIEW_REASON_REQUIRED },
    },
    {
      condition: 'the request is already APPROVED and HR rejects it',
      result: 'reject the decision as DECISION_CONFLICT',
      input: {
        currentStatus: REQUEST_STATUS.APPROVED,
        targetStatus: REQUEST_STATUS.REJECTED,
        reviewReason: 'Changed my mind',
      },
      expected: { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.DECISION_CONFLICT },
    },
    {
      condition: 'the request is already REJECTED and HR approves it',
      result: 'reject the decision as DECISION_CONFLICT',
      input: {
        currentStatus: REQUEST_STATUS.REJECTED,
        targetStatus: REQUEST_STATUS.APPROVED,
        reviewReason: null,
      },
      expected: { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.DECISION_CONFLICT },
    },
    {
      condition: 'the request is already APPROVED and the requester tries to approve it again',
      result: 'reject the decision as SELF_REVIEW_FORBIDDEN',
      input: {
        currentStatus: REQUEST_STATUS.APPROVED,
        targetStatus: REQUEST_STATUS.APPROVED,
        reviewReason: null,
        reviewerIsRequester: true,
      },
      expected: { kind: 'violation', violation: REQUEST_DECISION_VIOLATION.SELF_REVIEW_FORBIDDEN },
    },
  ])('should $result when $condition', ({ input, expected }) => {
    const { reviewerIsRequester = false, ...decision } = input;
    const result = evaluateRequestDecision({
      ...decision,
      requestedByAccountId: REQUESTER_ACCOUNT_ID,
      reviewerAccountId: reviewerIsRequester ? REQUESTER_ACCOUNT_ID : REVIEWER_ACCOUNT_ID,
    });

    expect(result).toEqual(expected);
  });
});
