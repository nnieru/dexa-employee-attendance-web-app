import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { PHOTO_THUMBNAIL_DATA_URL_PREFIX, PHOTO_THUMBNAIL_SIZE } from '@dexa/contracts';
import sharp from 'sharp';
import { SharpPhotoThumbnailProcessor } from './sharp-photo-thumbnail.processor.js';

// The internal HTTP client refuses a response above this size (MAX_RESPONSE_BYTES in libs/common, which is not exported).
const INTERNAL_RESPONSE_LIMIT_BYTES = 1_048_576;
const THUMBNAIL_COUNT = 100;
const COLOR_TOLERANCE = 6;
const ORIENTATION_ROTATED_NINETY = 6;

const processor = new SharpPhotoThumbnailProcessor();

// Random bytes are the hardest content for a JPEG to compress, so they bound the size of a thumbnail from above.
async function randomNoisePhoto(): Promise<Buffer> {
  const raw = randomBytes(PHOTO_THUMBNAIL_SIZE * PHOTO_THUMBNAIL_SIZE * 3);
  return sharp(raw, {
    raw: { width: PHOTO_THUMBNAIL_SIZE, height: PHOTO_THUMBNAIL_SIZE, channels: 3 },
  })
    .png()
    .toBuffer();
}

async function solidPhoto(width: number, height: number, background: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer();
}

describe('SharpPhotoThumbnailProcessor.createThumbnail', () => {
  it('should return a JPEG of the thumbnail size when the photo is landscape', async () => {
    const thumbnail = await processor.createThumbnail(await solidPhoto(300, 100, '#336699'));

    const metadata = await sharp(thumbnail).metadata();
    expect(metadata.format).toBe('jpeg');
    expect([metadata.width, metadata.height]).toEqual([PHOTO_THUMBNAIL_SIZE, PHOTO_THUMBNAIL_SIZE]);
  });

  it('should fill the square with the photo when the photo is landscape', async () => {
    const thumbnail = await processor.createThumbnail(await solidPhoto(300, 100, '#336699'));

    const { data } = await sharp(thumbnail).raw().toBuffer({ resolveWithObject: true });
    const cornerPixel = [data[0], data[1], data[2]];
    expect(cornerPixel[0]).toBeGreaterThan(0x33 - COLOR_TOLERANCE);
    expect(cornerPixel[0]).toBeLessThan(0x33 + COLOR_TOLERANCE);
    expect(cornerPixel[2]).toBeGreaterThan(0x99 - COLOR_TOLERANCE);
    expect(cornerPixel[2]).toBeLessThan(0x99 + COLOR_TOLERANCE);
  });

  it('should return bytes with no EXIF metadata when the photo carried EXIF', async () => {
    const withExif = await sharp({
      create: { width: 120, height: 80, channels: 3, background: '#112233' },
    })
      .jpeg()
      .withMetadata({
        orientation: ORIENTATION_ROTATED_NINETY,
        exif: { IFD0: { Make: 'Test camera' } },
      })
      .toBuffer();

    const thumbnail = await processor.createThumbnail(withExif);

    const metadata = await sharp(thumbnail).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it('should reject when the bytes are not an image', async () => {
    await expect(processor.createThumbnail(Buffer.from('This is plain text.'))).rejects.toThrow();
  });

  it('should keep 100 worst-case thumbnails well under the internal response limit when serialized', async () => {
    const noisePhoto = await randomNoisePhoto();
    const items: { accountId: string; thumbnail: string }[] = [];
    for (let index = 0; index < THUMBNAIL_COUNT; index += 1) {
      const thumbnail = await processor.createThumbnail(noisePhoto);
      items.push({
        accountId: randomUUID(),
        thumbnail: `${PHOTO_THUMBNAIL_DATA_URL_PREFIX}${thumbnail.toString('base64')}`,
      });
    }

    const serializedBytes = Buffer.byteLength(JSON.stringify({ items }), 'utf8');

    // Measured at quality 60: about 587 KiB for 100 random-noise thumbnails, which is 56 percent of the limit. The
    // assertion allows 70 percent, so a change in the encoder or the framing does not make this test flaky.
    expect(serializedBytes).toBeLessThan(INTERNAL_RESPONSE_LIMIT_BYTES * 0.7);
  });
});
