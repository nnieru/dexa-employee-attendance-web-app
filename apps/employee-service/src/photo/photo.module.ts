import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module.js';
import { EmployeePhotoController } from './employee-photo.controller.js';
import { EMPLOYEE_PHOTO_SERVICE } from './employee-photo.service.interface.js';
import { EmployeePhotoService } from './employee-photo.service.js';
import { OwnPhotoController } from './own-photo.controller.js';
import { OWN_PHOTO_SERVICE } from './own-photo.service.interface.js';
import { OwnPhotoService } from './own-photo.service.js';
import { FilePhotoStorage } from './file-photo.storage.js';
import { PHOTO_PROCESSOR } from './photo-processor.interface.js';
import { SharpPhotoProcessor } from './sharp-photo.processor.js';
import { PHOTO_STORAGE } from './photo-storage.interface.js';

// OwnPhotoController is listed first on purpose: its static `me/photo` route must be registered before the
// `:accountId/photo` route, so that `me` is never read as an account ID.
@Module({
  imports: [ProfileModule],
  controllers: [OwnPhotoController, EmployeePhotoController],
  providers: [
    { provide: OWN_PHOTO_SERVICE, useClass: OwnPhotoService },
    { provide: EMPLOYEE_PHOTO_SERVICE, useClass: EmployeePhotoService },
    { provide: PHOTO_PROCESSOR, useClass: SharpPhotoProcessor },
    { provide: PHOTO_STORAGE, useClass: FilePhotoStorage },
  ],
})
export class PhotoModule {}
