import { GatewayUserAuthGuard, Roles, RolesGuard } from '@dexa/common';
import {
  photoThumbnailRequestSchema,
  Role,
  type PhotoThumbnailRequest,
  type PhotoThumbnailResponse,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  EMPLOYEE_PHOTO_THUMBNAIL_SERVICE,
  type IEmployeePhotoThumbnailService,
} from './employee-photo-thumbnail.service.interface.js';

// POST because the ID list is bounded by the body schema, not by a query string. The call only reads, so it answers 200.
@Controller('employees')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class EmployeePhotoThumbnailController {
  constructor(
    @Inject(EMPLOYEE_PHOTO_THUMBNAIL_SERVICE)
    private readonly photoThumbnails: IEmployeePhotoThumbnailService,
  ) {}

  // The thumbnails are personal images, so no cache may keep them.
  @Post('photo-thumbnails')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  async getPhotoThumbnails(
    @Body(new ZodValidationPipe(photoThumbnailRequestSchema)) request: PhotoThumbnailRequest,
  ): Promise<PhotoThumbnailResponse> {
    const items = await this.photoThumbnails.getThumbnails(request.accountIds);
    return { items };
  }
}
