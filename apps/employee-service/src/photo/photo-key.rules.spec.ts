import { createPhotoKey, isPhotoKey } from './photo-key.rules.js';

describe('createPhotoKey', () => {
  it('should return a UUID file name with the JPEG extension when a key is created', () => {
    expect(createPhotoKey()).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  });

  it('should return a different key on every call when keys are created', () => {
    expect(createPhotoKey()).not.toBe(createPhotoKey());
  });
});

describe('isPhotoKey', () => {
  it.each([
    { condition: 'a generated UUID key', value: '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg' },
    { condition: 'the key from createPhotoKey', value: createPhotoKey() },
  ])('should accept $condition', ({ value }) => {
    expect(isPhotoKey(value)).toBe(true);
  });

  it.each([
    {
      condition: 'the key is a parent-directory traversal',
      value: '../3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg',
    },
    {
      condition: 'the key contains a separator',
      value: 'sub/3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg',
    },
    { condition: 'the key has an absolute path', value: '/etc/passwd.jpg' },
    {
      condition: 'the key has an uppercase UUID',
      value: '3F1B2C4D-0A9E-4B8F-8C7D-6E5F4A3B2C1D.jpg',
    },
    { condition: 'the extension is not jpg', value: '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.png' },
    { condition: 'the name is missing', value: '.jpg' },
    {
      condition: 'the key has a null byte',
      value: '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1\u0000.jpg',
    },
    {
      condition: 'the key is one character too long',
      value: '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1de.jpg',
    },
    { condition: 'the key is empty', value: '' },
  ])('should reject the key when $condition', ({ value }) => {
    expect(isPhotoKey(value)).toBe(false);
  });
});
