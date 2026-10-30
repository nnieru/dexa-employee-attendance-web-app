import type { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import {
  EMPLOYEE_PROFILE_READER,
  type IEmployeeProfileReader,
} from '../profile/employee-profile.reader.interface.js';
import type { IEmployeePhotoService } from './employee-photo.service.interface.js';
import { openStoredPhoto } from './open-stored-photo.js';
import { PHOTO_STORAGE, type IPhotoStorage } from './photo-storage.interface.js';

@Injectable()
export class EmployeePhotoService implements IEmployeePhotoService {
  constructor(
    @Inject(EMPLOYEE_PROFILE_READER) private readonly profiles: IEmployeeProfileReader,
    @Inject(PHOTO_STORAGE) private readonly storage: IPhotoStorage,
  ) {}

  // A missing profile has no photo, so it is reported as the missing photo, the same answer as a profile
  // without a photo. The list that links here already showed HR the profile.
  async getEmployeePhoto(accountId: string): Promise<Readable> {
    const profile = await this.profiles.findProfileByAccountId(accountId);
    return openStoredPhoto(this.storage, profile?.photoKey ?? null);
  }
}
