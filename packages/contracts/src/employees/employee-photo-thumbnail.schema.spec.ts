import {
  PHOTO_THUMBNAIL_DATA_URL_PREFIX,
  PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS,
  photoThumbnailItemSchema,
  photoThumbnailRequestSchema,
  photoThumbnailResponseSchema,
} from './employee-photo-thumbnail.schema.js';

const VALID_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACCOUNT_ID = '7a9b2c3d-1e4f-4a5b-8c6d-9e0f1a2b3c4d';
const VALID_THUMBNAIL = `${PHOTO_THUMBNAIL_DATA_URL_PREFIX}/9j/4AAQSkZJRg==`;

function uuidsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = index.toString(16).padStart(12, '0');
    return `5f0c1f3e-8d2a-4b7e-9c61-${suffix}`;
  });
}

describe('photoThumbnailRequestSchema', () => {
  it('should accept the request when it carries the maximum number of unique IDs', () => {
    const request = { accountIds: uuidsOf(PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS) };

    expect(photoThumbnailRequestSchema.parse(request)).toEqual(request);
  });

  it('should accept the request when it carries one ID', () => {
    const request = { accountIds: [VALID_ACCOUNT_ID] };

    expect(photoThumbnailRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    {
      condition: 'it carries one more ID than the maximum',
      body: { accountIds: uuidsOf(PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS + 1) },
    },
    {
      condition: 'an ID appears twice',
      body: { accountIds: [VALID_ACCOUNT_ID, OTHER_ACCOUNT_ID, VALID_ACCOUNT_ID] },
    },
    { condition: 'the ID list is empty', body: { accountIds: [] } },
    { condition: 'an ID is not a UUID', body: { accountIds: ['not-a-uuid'] } },
    { condition: 'the ID list is missing', body: {} },
    {
      condition: 'an unknown field is present',
      body: { accountIds: [VALID_ACCOUNT_ID], email: 'nadia.rahma@dexa.test' },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(photoThumbnailRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('photoThumbnailItemSchema', () => {
  it('should accept an item when the thumbnail is a base64 JPEG data URL', () => {
    const item = { accountId: VALID_ACCOUNT_ID, thumbnail: VALID_THUMBNAIL };

    expect(photoThumbnailItemSchema.parse(item)).toEqual(item);
  });

  it.each([
    { condition: 'the thumbnail is a PNG data URL', thumbnail: 'data:image/png;base64,/9j/4AAQ' },
    { condition: 'the thumbnail is a plain URL', thumbnail: '/api/v1/employees/x/photo' },
    {
      condition: 'the base64 part has a space',
      thumbnail: `${PHOTO_THUMBNAIL_DATA_URL_PREFIX}/9j 4A`,
    },
    { condition: 'the base64 part is empty', thumbnail: PHOTO_THUMBNAIL_DATA_URL_PREFIX },
  ])('should reject an item when $condition', ({ thumbnail }) => {
    expect(
      photoThumbnailItemSchema.safeParse({ accountId: VALID_ACCOUNT_ID, thumbnail }).success,
    ).toBe(false);
  });
});

describe('photoThumbnailResponseSchema', () => {
  it('should accept an empty page when no requested account has a photo', () => {
    expect(photoThumbnailResponseSchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it('should reject a response with more items than the request can ask for', () => {
    const items = uuidsOf(PHOTO_THUMBNAIL_MAX_ACCOUNT_IDS + 1).map((accountId) => ({
      accountId,
      thumbnail: VALID_THUMBNAIL,
    }));

    expect(photoThumbnailResponseSchema.safeParse({ items }).success).toBe(false);
  });
});
