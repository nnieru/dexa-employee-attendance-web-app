import { z } from 'zod';

// The reason is free text that HR reads on review. DATABASE §5.6 requires it to be non-empty after trimming, and
// this bound keeps one request's text small. It is not a stored column width, because the column is text.
export const REQUEST_REASON_MAX_LENGTH = 500;

// Shared by overtime and correction requests (DATABASE §5.6): trimmed, non-blank, bounded.
export const requestReasonSchema = z.string().trim().min(1).max(REQUEST_REASON_MAX_LENGTH);

// The HR reason on a decision. Trimmed and bounded like the requester's reason, but it may be blank here: the decision
// rule refuses a blank reason on reject with REVIEW_REASON_REQUIRED, and that rule is the single place that decides it.
export const requestReviewReasonSchema = z.string().trim().max(REQUEST_REASON_MAX_LENGTH);

// Client-generated per submission attempt (DATABASE §5.6), so an identical retry sends the same key.
export const requestIdempotencyKeySchema = z.uuid();

// The request's own ID in a decision path, such as /overtime-requests/:id/approve.
export const requestIdSchema = z.uuid();
