import { GatewayUserAuthGuard, Roles, RolesGuard } from '@dexa/common';
import { accountIdSchema, PHOTO_CONTENT_TYPE, Role } from '@dexa/contracts';
import { Controller, Get, Header, Inject, Param, StreamableFile, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  EMPLOYEE_PHOTO_SERVICE,
  type IEmployeePhotoService,
} from './employee-photo.service.interface.js';

// The static `me/photo` route is declared in OwnPhotoController, which this module registers first, so `me`
// never reaches the UUID check below. A spec covers that order.
@Controller('employees')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class EmployeePhotoController {
  constructor(
    @Inject(EMPLOYEE_PHOTO_SERVICE) private readonly employeePhotos: IEmployeePhotoService,
  ) {}

  // Same headers as the owner's photo: the bytes are private, and their type is fixed so they cannot render as markup.
  @Get(':accountId/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async getEmployeePhoto(
    @Param('accountId', new ZodValidationPipe(accountIdSchema)) accountId: string,
  ): Promise<StreamableFile> {
    const photo = await this.employeePhotos.getEmployeePhoto(accountId);
    return new StreamableFile(photo, { type: PHOTO_CONTENT_TYPE });
  }
}
