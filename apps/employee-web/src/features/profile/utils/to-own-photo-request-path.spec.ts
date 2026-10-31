import { describe, expect, it } from 'vitest';
import { toOwnPhotoRequestPath } from './to-own-photo-request-path.js';

describe('toOwnPhotoRequestPath', () => {
  it('should return the path below the API prefix when the photo URL is the protected API path', () => {
    expect(toOwnPhotoRequestPath('/api/v1/employees/me/photo')).toBe('/employees/me/photo');
  });

  it.each([
    {
      condition: 'the URL is absolute',
      photoUrl: 'https://elsewhere.example/api/v1/employees/me/photo',
    },
    { condition: 'the URL is outside the API prefix', photoUrl: '/employees/me/photo' },
    { condition: 'the URL is empty', photoUrl: '' },
  ])('should return null when $condition', ({ photoUrl }) => {
    expect(toOwnPhotoRequestPath(photoUrl)).toBeNull();
  });
});
