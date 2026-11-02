import { z } from 'zod';
import { Portal } from './portal.js';

export const sessionPortalSchema = z.strictObject({
  portal: z.enum(Portal),
});

export type SessionPortal = z.infer<typeof sessionPortalSchema>;
