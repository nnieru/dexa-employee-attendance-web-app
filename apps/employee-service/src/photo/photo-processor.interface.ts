export const PHOTO_PROCESSOR = Symbol('IPhotoProcessor');

/** Turns an uploaded file into the stored photo. Validation is by decoded content, never by name or MIME type. */
export interface IPhotoProcessor {
  /**
   * Resolves to a metadata-free JPEG that fits 1024 by 1024 pixels. Rejects with PHOTO_INVALID when the bytes
   * are not a JPEG or PNG within the pixel limit.
   */
  normalizePhoto(upload: Buffer): Promise<Buffer>;
}
