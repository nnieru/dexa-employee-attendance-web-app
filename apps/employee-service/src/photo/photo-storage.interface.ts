import type { Readable } from 'node:stream';

export const PHOTO_STORAGE = Symbol('IPhotoStorage');

/** Durable storage for stored photos, addressed only by their server-generated keys. */
export interface IPhotoStorage {
  /** Writes the photo under a new key and resolves once the file is durable on disk. */
  save(photo: Buffer): Promise<string>;
  /** Resolves to a stream of the stored photo, or undefined when no file has that key. */
  open(photoKey: string): Promise<Readable | undefined>;
  /** Resolves to the cached thumbnail bytes of the photo, or undefined when none is cached. */
  readThumbnail(photoKey: string): Promise<Buffer | undefined>;
  /**
   * Caches the thumbnail beside the photo. A failed write leaves no partial file, and the caller decides whether
   * the failure matters, because a thumbnail can always be made again from the photo.
   */
  saveThumbnail(photoKey: string, thumbnail: Buffer): Promise<void>;
  /**
   * Removes the stored photo and its cached thumbnail. A file that is already missing is not an error. The
   * thumbnail is named from the photo key, so the photo's removal is the only cleanup a replaced photo needs.
   */
  remove(photoKey: string): Promise<void>;
}
