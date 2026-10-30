import type { Readable } from 'node:stream';
import type { IPhotoStorage } from './photo-storage.interface.js';
import { photoNotFoundError } from './photo.errors.js';

/**
 * Opens the stored file behind a photo reference. A profile without a reference and a reference without a file
 * are both NOT_FOUND, so every caller that serves a photo reports them the same way.
 */
export async function openStoredPhoto(
  storage: IPhotoStorage,
  photoKey: string | null,
): Promise<Readable> {
  if (photoKey === null) throw photoNotFoundError();
  const photo = await storage.open(photoKey);
  if (photo === undefined) throw photoNotFoundError();
  return photo;
}
