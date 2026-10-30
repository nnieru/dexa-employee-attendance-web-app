import { ErrorCode, MAX_PHOTO_BYTES } from '@dexa/contracts';
import { NotFoundError, PayloadTooLargeError, ValidationError } from '@dexa/common';

const BYTES_PER_MEBIBYTE = 1024 * 1024;
const PHOTO_INVALID_MESSAGE = 'The photo must be a JPEG or PNG image of at most 16 million pixels.';
const PHOTO_TOO_LARGE_MESSAGE = `The photo must be ${MAX_PHOTO_BYTES / BYTES_PER_MEBIBYTE} MiB or smaller.`;
const PHOTO_UPLOAD_REJECTED_MESSAGE = 'Send one photo as a multipart file in the photo field.';
const PHOTO_NOT_FOUND_MESSAGE = 'Employee photo not found.';

/** The bytes are not a JPEG or PNG within the pixel limit. The cause stays internal. */
export function photoInvalidError(cause?: unknown): ValidationError {
  return new ValidationError(ErrorCode.PHOTO_INVALID, PHOTO_INVALID_MESSAGE, { cause });
}

/** The upload exceeds the size limit, either by its declared length or while it is read. */
export function photoTooLargeError(): PayloadTooLargeError {
  return new PayloadTooLargeError(ErrorCode.PHOTO_TOO_LARGE, PHOTO_TOO_LARGE_MESSAGE);
}

/** The request has no single photo file in the photo field, or its multipart framing is malformed. */
export function photoUploadRejectedError(cause?: unknown): ValidationError {
  return new ValidationError(ErrorCode.VALIDATION_FAILED, PHOTO_UPLOAD_REJECTED_MESSAGE, { cause });
}

/** The employee has no photo to serve, or the stored file is missing. */
export function photoNotFoundError(): NotFoundError {
  return new NotFoundError(ErrorCode.NOT_FOUND, PHOTO_NOT_FOUND_MESSAGE);
}
