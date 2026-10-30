import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module.js';
import { OwnPhotoController } from './own-photo.controller.js';
import { OWN_PHOTO_SERVICE } from './own-photo.service.interface.js';
import { OwnPhotoService } from './own-photo.service.js';
import { FilePhotoStorage } from './file-photo.storage.js';
import { PHOTO_PROCESSOR } from './photo-processor.interface.js';
import { SharpPhotoProcessor } from './sharp-photo.processor.js';
import { PHOTO_STORAGE } from './photo-storage.interface.js';

@Module({
  imports: [ProfileModule],
  controllers: [OwnPhotoController],
  providers: [
    { provide: OWN_PHOTO_SERVICE, useClass: OwnPhotoService },
    { provide: PHOTO_PROCESSOR, useClass: SharpPhotoProcessor },
    { provide: PHOTO_STORAGE, useClass: FilePhotoStorage },
  ],
})
export class PhotoModule {}
