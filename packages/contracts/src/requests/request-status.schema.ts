import { z } from 'zod';

// The statuses a stored request holds. Overtime and correction requests share them.
export const requestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export type RequestStatus = z.infer<typeof requestStatusSchema>;
