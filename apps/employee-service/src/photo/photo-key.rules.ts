import { randomUUID } from 'node:crypto';

// A server-generated UUID with the JPEG extension (DATABASE §4.2). The pattern is checked before a key becomes a path.
const PHOTO_KEY_PATTERN = /^[0-9a-f-]{36}\.jpg$/;

/** Generates the immutable file name for a new photo. The client never chooses it. */
export function createPhotoKey(): string {
  return `${randomUUID()}.jpg`;
}

/** True only for a key this service could have generated, so it is safe to join onto the photo directory. */
export function isPhotoKey(value: string): boolean {
  return PHOTO_KEY_PATTERN.test(value);
}
