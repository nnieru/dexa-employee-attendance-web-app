// Photo upload limits (PRO-4, DATABASE §4.2). The gateway and employee-service both enforce them, so they live here.

/** The largest photo file accepted before decoding (D-02). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The largest decoded image accepted, so a small file cannot expand into an oversized decode. */
export const MAX_PHOTO_PIXELS = 16_000_000;

/** The stored JPEG fits inside a square of this size, keeping its aspect ratio. */
export const PHOTO_MAX_DIMENSION = 1024;

/** Allowance for the multipart framing around the file, so a valid request near the limit is not refused. */
export const PHOTO_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** The largest request body refused by Content-Length before multipart parsing starts. */
export const MAX_PHOTO_UPLOAD_BYTES = MAX_PHOTO_BYTES + PHOTO_MULTIPART_OVERHEAD_BYTES;

/** The multipart field that carries the photo. */
export const PHOTO_FIELD_NAME = 'photo';

/** Every stored photo is a metadata-free JPEG (DATABASE §4.2). */
export const PHOTO_CONTENT_TYPE = 'image/jpeg';
