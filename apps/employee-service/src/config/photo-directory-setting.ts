import { join, resolve, isAbsolute } from 'node:path';
import type { BaseConfig } from '@dexa/common';
import { z } from 'zod';

const SETTING_FIELD = 'EMPLOYEE_PHOTO_DIRECTORY';
// Local development keeps photos in an ignored work directory, relative to the service (see .gitignore).
const LOCAL_PHOTO_DIRECTORY = join('.data', 'photos');

/**
 * Resolves EMPLOYEE_PHOTO_DIRECTORY, the persistent directory that holds uploaded photos (DATABASE §4.2).
 * Production must name an absolute directory, because the photos must survive a restart. Other environments
 * fall back to the local work directory. Failure messages name the field only.
 */
export function resolvePhotoDirectorySetting(
  nodeEnvironment: BaseConfig['NODE_ENV'],
  setting: string | undefined,
  context: z.RefinementCtx,
): string {
  if (setting === undefined) {
    if (nodeEnvironment === 'production') {
      context.addIssue({
        code: 'custom',
        path: [SETTING_FIELD],
        message: 'must name an absolute directory when NODE_ENV is production',
      });
      return z.NEVER;
    }
    return resolve(LOCAL_PHOTO_DIRECTORY);
  }
  if (!isAbsolute(setting)) {
    context.addIssue({
      code: 'custom',
      path: [SETTING_FIELD],
      message: 'must be an absolute path',
    });
    return z.NEVER;
  }
  return setting;
}
