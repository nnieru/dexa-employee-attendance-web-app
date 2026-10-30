import type { Readable } from 'node:stream';

export const PHOTO_STORAGE = Symbol('IPhotoStorage');

/** Durable storage for stored photos, addressed only by their server-generated keys (DATABASE §4.2). */
export interface IPhotoStorage {
  /** Writes the photo under a new key and resolves once the file is durable on disk. */
  save(photo: Buffer): Promise<string>;
  /** Resolves to a stream of the stored photo, or undefined when no file has that key. */
  open(photoKey: string): Promise<Readable | undefined>;
  /** Removes the stored photo. A file that is already missing is not an error. */
  remove(photoKey: string): Promise<void>;
}
