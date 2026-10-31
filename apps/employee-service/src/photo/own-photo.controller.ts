import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import { PHOTO_CONTENT_TYPE, Role, type OwnProfile } from '@dexa/contracts';
import {
  Controller,
  Get,
  Header,
  Inject,
  Put,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  OWN_PROFILE_SERVICE,
  type IOwnProfileService,
} from '../profile/own-profile.service.interface.js';
import { OWN_PHOTO_SERVICE, type IOwnPhotoService } from './own-photo.service.interface.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';

// The identity comes only from the verified token. No route here takes an account parameter, so an employee
// reaches only their own photo.
@Controller('employees')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE, Role.HR)
export class OwnPhotoController {
  constructor(
    @Inject(OWN_PHOTO_SERVICE) private readonly ownPhotos: IOwnPhotoService,
    @Inject(OWN_PROFILE_SERVICE) private readonly ownProfiles: IOwnProfileService,
  ) {}

  // The photo is private to its owner, so no cache may keep it, and its type is fixed so it cannot render as markup.
  @Get('me/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async getOwnPhoto(@CurrentUser() user: AuthenticatedUser): Promise<StreamableFile> {
    const photo = await this.ownPhotos.getOwnPhoto(user.accountId);
    return new StreamableFile(photo, { type: PHOTO_CONTENT_TYPE });
  }

  // The response is the profile as stored after the change, read once the change has committed.
  @Put('me/photo')
  @UseInterceptors(PhotoUploadInterceptor)
  async replaceOwnPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() photo: Express.Multer.File,
  ): Promise<OwnProfile> {
    await this.ownPhotos.replacePhoto(user.accountId, photo.buffer);
    return this.ownProfiles.getOwnProfile(user.accountId);
  }
}
