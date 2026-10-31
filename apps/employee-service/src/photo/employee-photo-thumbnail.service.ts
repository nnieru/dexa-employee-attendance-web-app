import { Buffer } from 'node:buffer';
import { PHOTO_THUMBNAIL_DATA_URL_PREFIX, type PhotoThumbnailItem } from '@dexa/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EMPLOYEE_PHOTO_KEY_READER,
  type IEmployeePhotoKeyReader,
} from './employee-photo-key.reader.interface.js';
import { mapWithConcurrencyLimit } from './map-with-concurrency-limit.js';
import type { IEmployeePhotoThumbnailService } from './employee-photo-thumbnail.service.interface.js';
import {
  PHOTO_THUMBNAIL_PROCESSOR,
  type IPhotoThumbnailProcessor,
} from './photo-thumbnail-processor.interface.js';
import { PHOTO_STORAGE, type IPhotoStorage } from './photo-storage.interface.js';

// Thumbnails are generated on a cache miss. A bounded number run at once, so 100 misses cannot exhaust CPU or memory.
const PHOTO_THUMBNAIL_CONCURRENCY = 4;

type PhotoTarget = {
  readonly accountId: string;
  readonly photoKey: string;
};

@Injectable()
export class EmployeePhotoThumbnailService implements IEmployeePhotoThumbnailService {
  private readonly logger = new Logger(EmployeePhotoThumbnailService.name);

  constructor(
    @Inject(EMPLOYEE_PHOTO_KEY_READER) private readonly photoKeys: IEmployeePhotoKeyReader,
    @Inject(PHOTO_STORAGE) private readonly storage: IPhotoStorage,
    @Inject(PHOTO_THUMBNAIL_PROCESSOR) private readonly processor: IPhotoThumbnailProcessor,
  ) {}

  async getThumbnails(accountIds: ReadonlyArray<string>): Promise<PhotoThumbnailItem[]> {
    const records = await this.photoKeys.findPhotoKeysByAccountIds(accountIds);
    const photoKeyByAccountId = new Map<string, string>(
      records.map((record): [string, string] => [record.accountId, record.photoKey]),
    );
    const targets = accountIds.flatMap((accountId): PhotoTarget[] => {
      const photoKey = photoKeyByAccountId.get(accountId);
      return photoKey === undefined ? [] : [{ accountId, photoKey }];
    });
    const items = await mapWithConcurrencyLimit(targets, PHOTO_THUMBNAIL_CONCURRENCY, (target) =>
      this.thumbnailFor(target),
    );
    return items.filter((item): item is PhotoThumbnailItem => item !== undefined);
  }

  // Never rejects: a missing, unreadable, or undecodable photo omits its own account and is logged by its key only.
  private async thumbnailFor(target: PhotoTarget): Promise<PhotoThumbnailItem | undefined> {
    try {
      const thumbnail = await this.readOrCreateThumbnail(target.photoKey);
      if (thumbnail === undefined) {
        this.logger.warn(
          `Photo thumbnail omitted for ${target.photoKey} (the stored file is missing).`,
        );
        return undefined;
      }
      return {
        accountId: target.accountId,
        thumbnail: `${PHOTO_THUMBNAIL_DATA_URL_PREFIX}${thumbnail.toString('base64')}`,
      };
    } catch (error: unknown) {
      this.logger.warn(`Photo thumbnail omitted for ${target.photoKey} (${describeError(error)}).`);
      return undefined;
    }
  }

  // A cached thumbnail is served as it is. Otherwise the stored photo is decoded once, and its thumbnail is cached.
  private async readOrCreateThumbnail(photoKey: string): Promise<Buffer | undefined> {
    const cached = await this.storage.readThumbnail(photoKey);
    if (cached !== undefined) return cached;
    const storedPhoto = await this.readStoredPhoto(photoKey);
    if (storedPhoto === undefined) return undefined;
    const thumbnail = await this.processor.createThumbnail(storedPhoto);
    await this.cacheThumbnailBestEffort(photoKey, thumbnail);
    return thumbnail;
  }

  private async readStoredPhoto(photoKey: string): Promise<Buffer | undefined> {
    const stream = await this.storage.open(photoKey);
    if (stream === undefined) return undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // The thumbnail was made, so a failed cache write only costs a later regeneration. It is logged, not thrown.
  private async cacheThumbnailBestEffort(photoKey: string, thumbnail: Buffer): Promise<void> {
    try {
      await this.storage.saveThumbnail(photoKey, thumbnail);
    } catch (error: unknown) {
      this.logger.warn(`Could not cache the thumbnail for ${photoKey} (${describeError(error)}).`);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
