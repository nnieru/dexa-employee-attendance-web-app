import type { AuthenticatedUser } from '@dexa/common';
import type { CorrectionRequest, SubmitCorrectionRequest } from '@dexa/contracts';

/** The gateway's calls into attendance-service for correction requests. The controller depends on this port, not on the transport. */
export interface ICorrectionRequestClient {
  submitCorrection(
    user: AuthenticatedUser,
    request: SubmitCorrectionRequest,
  ): Promise<CorrectionRequest>;
}

export const CORRECTION_REQUEST_CLIENT = Symbol('ICorrectionRequestClient');
