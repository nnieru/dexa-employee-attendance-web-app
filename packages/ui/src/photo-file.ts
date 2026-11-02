/**
 * Client-side photo checks for PhotoUploader. They give early feedback only: the server decodes the
 * image and makes the real decision, so a file that passes here can still be refused.
 */

export const PHOTO_ACCEPT_ATTRIBUTE = 'image/jpeg,image/png';

export type PhotoMimeType = 'image/jpeg' | 'image/png';

export type PhotoRejection = 'wrong-type' | 'too-large' | 'not-an-image' | 'unreadable';

export type PhotoCheckResult =
  { status: 'accepted' } | { status: 'rejected'; rejection: PhotoRejection };

const PHOTO_MIME_TYPES: readonly PhotoMimeType[] = ['image/jpeg', 'image/png'];
const JPEG_SIGNATURE: readonly number[] = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const LEADING_BYTE_COUNT = PNG_SIGNATURE.length;
const BYTES_PER_KIBIBYTE = 1024;
const BYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;

/** Reads the leading bytes of a file and reports the image type they describe, or null. */
export function detectPhotoMimeType(leadingBytes: Uint8Array): PhotoMimeType | null {
  if (startsWithSignature(leadingBytes, PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (startsWithSignature(leadingBytes, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }
  return null;
}

/**
 * Accepts a file only when its declared type is JPEG or PNG and its first bytes are a JPEG or PNG
 * signature. The declared type alone is not trusted, so a renamed text file is rejected here.
 */
export async function checkPhotoFile(file: File, maxBytes: number): Promise<PhotoCheckResult> {
  if (!isPhotoMimeType(file.type)) {
    return rejected('wrong-type');
  }
  if (file.size > maxBytes) {
    return rejected('too-large');
  }
  const leadingBytes = await readLeadingBytes(file);
  if (!leadingBytes) {
    return rejected('unreadable');
  }
  return detectPhotoMimeType(leadingBytes) ? { status: 'accepted' } : rejected('not-an-image');
}

/** Formats a byte limit for people, for example 5242880 becomes "5 MB". */
export function formatByteLimit(bytes: number): string {
  if (bytes >= BYTES_PER_MEBIBYTE) {
    return `${roundToTenth(bytes / BYTES_PER_MEBIBYTE)} MB`;
  }
  if (bytes >= BYTES_PER_KIBIBYTE) {
    return `${roundToTenth(bytes / BYTES_PER_KIBIBYTE)} KB`;
  }
  return `${bytes} bytes`;
}

function rejected(rejection: PhotoRejection): PhotoCheckResult {
  return { status: 'rejected', rejection };
}

function isPhotoMimeType(value: string): value is PhotoMimeType {
  return (PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

function startsWithSignature(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

async function readLeadingBytes(file: File): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await file.slice(0, LEADING_BYTE_COUNT).arrayBuffer());
  } catch {
    // The browser could not read the file (for example, it was removed after selection).
    return null;
  }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
