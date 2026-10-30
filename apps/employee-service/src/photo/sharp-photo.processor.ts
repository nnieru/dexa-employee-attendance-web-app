import { Injectable } from '@nestjs/common';
import { MAX_PHOTO_PIXELS, PHOTO_MAX_DIMENSION } from '@dexa/contracts';
import sharp from 'sharp';
import { photoInvalidError } from './photo.errors.js';
import type { IPhotoProcessor } from './photo-processor.interface.js';

// The decoder refuses an image above the pixel limit before it allocates the pixels, and it fails on a corrupt
// image rather than returning a partial decode.
const DECODE_OPTIONS = { limitInputPixels: MAX_PHOTO_PIXELS, failOn: 'error' } as const;
const ACCEPTED_FORMATS: ReadonlyArray<string> = ['jpeg', 'png'];
// A transparent PNG becomes white rather than black, because JPEG has no transparency.
const FLATTEN_BACKGROUND = '#ffffff';

@Injectable()
export class SharpPhotoProcessor implements IPhotoProcessor {
  async normalizePhoto(upload: Buffer): Promise<Buffer> {
    // A decode failure of the uploaded bytes is the client's invalid input. The cause stays internal.
    try {
      await assertAcceptedFormat(upload);
      return await reencode(upload);
    } catch (error: unknown) {
      throw photoInvalidError(error);
    }
  }
}

async function assertAcceptedFormat(upload: Buffer): Promise<void> {
  const metadata = await sharp(upload, DECODE_OPTIONS).metadata();
  if (metadata.format === undefined || !ACCEPTED_FORMATS.includes(metadata.format)) {
    throw new Error('The decoded image is not a JPEG or PNG.');
  }
}

// rotate() applies the EXIF orientation and drops it. Metadata is not kept unless withMetadata() is called, so
// the output carries no EXIF, GPS, or other embedded data.
function reencode(upload: Buffer): Promise<Buffer> {
  return sharp(upload, DECODE_OPTIONS)
    .rotate()
    .flatten({ background: FLATTEN_BACKGROUND })
    .resize(PHOTO_MAX_DIMENSION, PHOTO_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg()
    .toBuffer();
}
