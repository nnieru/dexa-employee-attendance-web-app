import { Buffer } from 'node:buffer';
import { ErrorCode, MAX_PHOTO_BYTES, PHOTO_MAX_DIMENSION } from '@dexa/contracts';
import { ValidationError } from '@dexa/common';
import sharp, { type Metadata, type Sharp } from 'sharp';
import { SharpPhotoProcessor } from './sharp-photo.processor.js';

// A 1x1 GIF, which the photo rules refuse by its decoded format.
const GIF_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);
const ORIENTATION_ROTATED_NINETY = 6;

const processor = new SharpPhotoProcessor();

function solidImage(width: number, height: number): Sharp {
  return sharp({ create: { width, height, channels: 3, background: '#336699' } });
}

async function decodedMetadata(bytes: Buffer): Promise<Metadata> {
  return sharp(bytes).metadata();
}

async function expectInvalidPhoto(upload: Buffer): Promise<void> {
  const failure: unknown = await processor.normalizePhoto(upload).then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(ValidationError);
  expect(failure).toMatchObject({ code: ErrorCode.PHOTO_INVALID });
}

describe('SharpPhotoProcessor.normalizePhoto', () => {
  it('should return a JPEG when the upload is a PNG', async () => {
    const png = await solidImage(300, 200).png().toBuffer();

    const stored = await processor.normalizePhoto(png);

    expect((await decodedMetadata(stored)).format).toBe('jpeg');
  });

  it('should return bytes with no EXIF metadata when the upload carried EXIF', async () => {
    const withExif = await solidImage(120, 80)
      .jpeg()
      .withMetadata({
        orientation: ORIENTATION_ROTATED_NINETY,
        exif: { IFD0: { Make: 'Test camera' } },
      })
      .toBuffer();

    const stored = await processor.normalizePhoto(withExif);

    const metadata = await decodedMetadata(stored);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it('should apply the EXIF orientation to the pixels when the upload declares a rotation', async () => {
    const rotated = await solidImage(200, 100)
      .jpeg()
      .withMetadata({ orientation: ORIENTATION_ROTATED_NINETY })
      .toBuffer();

    const stored = await processor.normalizePhoto(rotated);

    const metadata = await decodedMetadata(stored);
    expect([metadata.width, metadata.height]).toEqual([100, 200]);
  });

  it('should fit a large image inside the bound while keeping its aspect ratio', async () => {
    const large = await solidImage(3000, 2000).jpeg().toBuffer();

    const stored = await processor.normalizePhoto(large);

    const metadata = await decodedMetadata(stored);
    expect(metadata.width).toBe(PHOTO_MAX_DIMENSION);
    expect(metadata.height).toBe(Math.round((PHOTO_MAX_DIMENSION * 2000) / 3000));
  });

  it('should keep the size of an image that already fits inside the bound', async () => {
    const small = await solidImage(300, 200).png().toBuffer();

    const stored = await processor.normalizePhoto(small);

    const metadata = await decodedMetadata(stored);
    expect([metadata.width, metadata.height]).toEqual([300, 200]);
  });

  it('should accept an image of exactly the pixel limit when its decoded size is 16 million pixels', async () => {
    const atLimit = await solidImage(4000, 4000).png().toBuffer();

    const stored = await processor.normalizePhoto(atLimit);

    expect((await decodedMetadata(stored)).format).toBe('jpeg');
  });

  it('should reject an image above the pixel limit even when its file is small', async () => {
    const overLimit = await solidImage(5000, 4000).jpeg().toBuffer();

    expect(overLimit.length).toBeLessThan(MAX_PHOTO_BYTES);
    await expectInvalidPhoto(overLimit);
  });

  it('should reject a text file, even one named as a JPEG, because its content is not an image', async () => {
    await expectInvalidPhoto(Buffer.from('This is plain text, not a photo.'));
  });

  it('should reject a GIF because its decoded format is not a JPEG or PNG', async () => {
    await expectInvalidPhoto(GIF_BYTES);
  });

  it('should reject a WebP because its decoded format is not a JPEG or PNG', async () => {
    const webp = await solidImage(64, 64).webp().toBuffer();

    await expectInvalidPhoto(webp);
  });

  it('should reject a JPEG whose body is truncated, because it cannot be decoded', async () => {
    const jpeg = await solidImage(400, 400).jpeg().toBuffer();

    await expectInvalidPhoto(jpeg.subarray(0, Math.floor(jpeg.length / 2)));
  });
});
