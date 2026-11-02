import { z } from 'zod';
import { createPageSchema, paginationQuerySchema } from '../pagination/pagination.schema.js';
import { requestStatusSchema } from './request-status.schema.js';
import { correctionRequestSchema } from './submit-correction-request.schema.js';
import { overtimeRequestSchema } from './submit-overtime-request.schema.js';

// The employee's own request lists. status is optional: absent means every status. Strict, so an unknown
// parameter such as an account ID is refused. The requester comes only from the token.
export const ownRequestListQuerySchema = paginationQuerySchema.extend({
  status: requestStatusSchema.optional(),
});

export type OwnRequestListQuery = z.infer<typeof ownRequestListQuerySchema>;

export const overtimeRequestPageSchema = createPageSchema(overtimeRequestSchema);

export type OvertimeRequestPage = z.infer<typeof overtimeRequestPageSchema>;

export const correctionRequestPageSchema = createPageSchema(correctionRequestSchema);

export type CorrectionRequestPage = z.infer<typeof correctionRequestPageSchema>;
