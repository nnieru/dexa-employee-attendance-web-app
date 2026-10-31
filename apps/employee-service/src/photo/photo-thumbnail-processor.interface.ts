export const PHOTO_THUMBNAIL_PROCESSOR = Symbol('IPhotoThumbnailProcessor');

/** Makes the small preview that HR's employee list shows. Its input is a photo already stored by this service. */
export interface IPhotoThumbnailProcessor {
  /**
   * Resolves to a square, cover-cropped, metadata-free JPEG of PHOTO_THUMBNAIL_SIZE pixels. Rejects when the
   * bytes cannot be decoded.
   */
  createThumbnail(storedPhoto: Buffer): Promise<Buffer>;
}
