import { Buffer } from 'node:buffer';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { FilePhotoStorage } from './file-photo.storage.js';

const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PHOTO_KEY_PATTERN = /^[0-9a-f-]{36}\.jpg$/;
const UNKNOWN_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const OUTSIDE_FILE_NAME = 'outside-the-photo-directory.jpg';
const OUTSIDE_FILE_BYTES = Buffer.from('must not be read or removed');

let root: string;
let directory: string;
let storage: FilePhotoStorage;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'photo-storage-spec-'));
  directory = join(root, 'photos');
  storage = new FilePhotoStorage({ EMPLOYEE_PHOTO_DIRECTORY: directory });
  await storage.onModuleInit();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function readStoredPhoto(photoKey: string): Promise<Buffer> {
  const stream = await storage.open(photoKey);
  if (stream === undefined) throw new Error('The saved photo is missing.');
  return readStream(stream);
}

async function expectRejectedAsMalformed(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toThrow('The photo key is malformed.');
}

describe('FilePhotoStorage.onModuleInit', () => {
  it('should create the photo directory when it is missing', async () => {
    const fresh = join(root, 'created', 'later');
    const freshStorage = new FilePhotoStorage({ EMPLOYEE_PHOTO_DIRECTORY: fresh });

    await freshStorage.onModuleInit();

    expect((await stat(fresh)).isDirectory()).toBe(true);
  });
});

describe('FilePhotoStorage.save', () => {
  it('should return a generated key and store the bytes under it when a photo is saved', async () => {
    const photoKey = await storage.save(PHOTO_BYTES);

    expect(photoKey).toMatch(PHOTO_KEY_PATTERN);
    expect((await readStoredPhoto(photoKey)).equals(PHOTO_BYTES)).toBe(true);
  });

  it('should leave only the final file in the directory when a photo is saved', async () => {
    const photoKey = await storage.save(PHOTO_BYTES);

    expect(await readdir(directory)).toEqual([photoKey]);
  });

  it('should return a different key for each saved photo', async () => {
    const first = await storage.save(PHOTO_BYTES);
    const second = await storage.save(PHOTO_BYTES);

    expect(first).not.toBe(second);
  });
});

describe('FilePhotoStorage.open', () => {
  it('should resolve to undefined when no file has the key', async () => {
    await expect(storage.open(UNKNOWN_KEY)).resolves.toBeUndefined();
  });

  it.each([
    { condition: 'the key is a parent-directory traversal', key: `../${OUTSIDE_FILE_NAME}` },
    { condition: 'the key is an absolute path', key: `/${OUTSIDE_FILE_NAME}` },
    { condition: 'the key has a separator', key: `nested/${UNKNOWN_KEY}` },
  ])('should reject the key without reading any file when $condition', async ({ key }) => {
    await writeFile(join(root, OUTSIDE_FILE_NAME), OUTSIDE_FILE_BYTES);

    await expectRejectedAsMalformed(storage.open(key));
  });
});

describe('FilePhotoStorage.remove', () => {
  it('should delete the stored file when the key exists', async () => {
    const photoKey = await storage.save(PHOTO_BYTES);

    await storage.remove(photoKey);

    expect(await readdir(directory)).toEqual([]);
  });

  it('should resolve without error when the file is already missing', async () => {
    await expect(storage.remove(UNKNOWN_KEY)).resolves.toBeUndefined();
  });

  it('should reject without removing any file when the key is a traversal', async () => {
    await writeFile(join(root, OUTSIDE_FILE_NAME), OUTSIDE_FILE_BYTES);

    await expectRejectedAsMalformed(storage.remove(`../${OUTSIDE_FILE_NAME}`));

    expect((await stat(join(root, OUTSIDE_FILE_NAME))).isFile()).toBe(true);
  });
});
