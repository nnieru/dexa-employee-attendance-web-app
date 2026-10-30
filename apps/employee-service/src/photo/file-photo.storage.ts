import { randomUUID } from 'node:crypto';
import { mkdir, open as openFile, rename, unlink } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { join } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { EmployeeServiceConfig } from '../config/employee-service-config.schema.js';
import { createPhotoKey, isPhotoKey } from './photo-key.rules.js';
import type { IPhotoStorage } from './photo-storage.interface.js';

// A partial file is written under this suffix, so it can never match a photo key and is renamed only when complete.
const PARTIAL_SUFFIX = '.partial';
const NOT_FOUND_CODE = 'ENOENT';

/**
 * Stores photos as files in EMPLOYEE_PHOTO_DIRECTORY. A save is durable before it resolves: the bytes are fsynced
 * under a temporary name, renamed to the final name, and the directory is fsynced so the rename survives a crash.
 */
@Injectable()
export class FilePhotoStorage implements IPhotoStorage, OnModuleInit {
  private readonly logger = new Logger(FilePhotoStorage.name);
  private readonly directory: string;

  constructor(@Inject(CONFIG) config: Pick<EmployeeServiceConfig, 'EMPLOYEE_PHOTO_DIRECTORY'>) {
    this.directory = config.EMPLOYEE_PHOTO_DIRECTORY;
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  async save(photo: Buffer): Promise<string> {
    const photoKey = createPhotoKey();
    const partialPath = join(this.directory, `${randomUUID()}${PARTIAL_SUFFIX}`);
    const finalPath = this.resolvePath(photoKey);
    try {
      await writeAndSync(partialPath, photo);
      await rename(partialPath, finalPath);
      await syncDirectory(this.directory);
    } catch (error: unknown) {
      await this.discardFailedSave([partialPath, finalPath]);
      throw error;
    }
    return photoKey;
  }

  async open(photoKey: string): Promise<Readable | undefined> {
    const path = this.resolvePath(photoKey);
    try {
      const handle = await openFile(path, 'r');
      return handle.createReadStream();
    } catch (error: unknown) {
      if (isErrorCode(error, NOT_FOUND_CODE)) return undefined;
      throw error;
    }
  }

  async remove(photoKey: string): Promise<void> {
    try {
      await unlink(this.resolvePath(photoKey));
    } catch (error: unknown) {
      if (!isErrorCode(error, NOT_FOUND_CODE)) throw error;
    }
  }

  // The key is checked against the strict pattern before it becomes a path, so no key can name a file outside
  // the photo directory.
  private resolvePath(photoKey: string): string {
    if (!isPhotoKey(photoKey)) throw new Error('The photo key is malformed.');
    return join(this.directory, photoKey);
  }

  // Cleanup must not hide the save failure, so a cleanup failure is logged by its error name only.
  private async discardFailedSave(paths: ReadonlyArray<string>): Promise<void> {
    for (const path of paths) {
      try {
        await unlink(path);
      } catch (error: unknown) {
        if (isErrorCode(error, NOT_FOUND_CODE)) continue;
        this.logger.warn(
          `Could not remove a photo file left by a failed save (${describeError(error)}).`,
        );
      }
    }
  }
}

// 'wx' refuses to overwrite, so a name collision cannot replace another photo.
async function writeAndSync(path: string, photo: Buffer): Promise<void> {
  const handle = await openFile(path, 'wx');
  try {
    await handle.writeFile(photo);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await openFile(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Checked by shape, not by instanceof, because errors from node:fs can come from another realm (as under Jest).
function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
