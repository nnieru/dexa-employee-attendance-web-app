import { z } from 'zod';
import { isSameAppPath } from './same-app-path.js';

// `redirect` names the page to show after sign-in. A value that is not a path on this app is dropped
// rather than rejected, so a bad link still reaches the login form.
export const loginSearchSchema = z.object({
  redirect: z.string().refine(isSameAppPath).optional().catch(undefined),
});

export type LoginSearch = z.infer<typeof loginSearchSchema>;
