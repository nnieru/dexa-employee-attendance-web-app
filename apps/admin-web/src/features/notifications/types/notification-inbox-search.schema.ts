import { NOTIFICATION_CURSOR_MAX_LENGTH } from '@dexa/contracts';
import { z } from 'zod';

/**
 * The inbox page state in the URL. The API pages by cursor, not by number, so the URL keeps the cursor that starts
 * each page after the first: an empty list is page 1, and each entry is the cursor for the next page. Page N is
 * therefore cursors.length + 1. An unusable value is dropped (`.catch`), so a hand-edited link opens the first page.
 */
export const notificationInboxSearchSchema = z.object({
  cursors: z
    .array(z.string().min(1).max(NOTIFICATION_CURSOR_MAX_LENGTH))
    .optional()
    .catch(undefined),
});

export type NotificationInboxSearch = z.infer<typeof notificationInboxSearchSchema>;
