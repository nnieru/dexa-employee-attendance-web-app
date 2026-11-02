import { z } from 'zod';

/** The most accounts one thumbnail request names. A longer list is split by the caller. */
export const PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS = 100;

/** Every thumbnail is a square of this many pixels. */
export const PHOTO_THUMBNAIL_SIZE = 96;

// Chosen so 100 worst-case thumbnails stay well under the 1 MiB internal response limit (libs/common). The estimate
// is recorded in the employee-service spec that measures it.
export const PHOTO_THUMBNAIL_QUALITY = 60;

/** Every thumbnail value starts with this prefix. The bytes after it are base64 of a JPEG. */
export const PHOTO_THUMBNAIL_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

// Strict, so a caller cannot send fields that the thumbnail lookup does not read. Duplicates are refused, so one
// account cannot take a share of the bounded list twice.
export const photoThumbnailRequestSchema = z.strictObject({
  accountIds: z
    .array(z.uuid())
    .min(1)
    .max(PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS)
    .refine((accountIds) => new Set(accountIds).size === accountIds.length, {
      message: 'The account IDs must be unique.',
    }),
});

export type PhotoThumbnailRequest = z.infer<typeof photoThumbnailRequestSchema>;

// Not strict: a reader that parses a response ignores fields that a later version adds.
export const photoThumbnailItemSchema = z.object({
  accountId: z.uuid(),
  thumbnail: z
    .string()
    .refine(
      (thumbnail) =>
        thumbnail.startsWith(PHOTO_THUMBNAIL_DATA_URL_PREFIX) &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(thumbnail.slice(PHOTO_THUMBNAIL_DATA_URL_PREFIX.length)),
      { message: 'The thumbnail must be a base64 JPEG data URL.' },
    ),
});

export type PhotoThumbnailItem = z.infer<typeof photoThumbnailItemSchema>;

// Accounts without a photo, or whose photo file cannot be read, are omitted, so the list can be shorter than the request.
export const photoThumbnailResponseSchema = z.object({
  items: z.array(photoThumbnailItemSchema).max(PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS),
});

export type PhotoThumbnailResponse = z.infer<typeof photoThumbnailResponseSchema>;
