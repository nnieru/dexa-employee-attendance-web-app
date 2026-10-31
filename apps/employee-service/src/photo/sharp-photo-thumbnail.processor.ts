import { Injectable } from '@nestjs/common';
import { MAX_PHOTO_PIXELS, PHOTO_THUMBNAIL_QUALITY, PHOTO_THUMBNAIL_SIZE } from '@dexa/contracts';
import sharp from 'sharp';
import type { IPhotoThumbnailProcessor } from './photo-thumbnail-processor.interface.js';

// The same decode limits as the upload path, so a stored file is never decoded above the pixel bound.
const DECODE_OPTIONS = { limitInputPixels: MAX_PHOTO_PIXELS, failOn: 'error' } as const;

@Injectable()
export class SharpPhotoThumbnailProcessor implements IPhotoThumbnailProcessor {
  // cover fills the square and crops the overflow, so a thumbnail never shows a letterbox. rotate() applies the
  // EXIF orientation, and no metadata is kept unless withMetadata() is called.
  createThumbnail(storedPhoto: Buffer): Promise<Buffer> {
    return sharp(storedPhoto, DECODE_OPTIONS)
      .rotate()
      .resize(PHOTO_THUMBNAIL_SIZE, PHOTO_THUMBNAIL_SIZE, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: PHOTO_THUMBNAIL_QUALITY })
      .toBuffer();
  }
}
