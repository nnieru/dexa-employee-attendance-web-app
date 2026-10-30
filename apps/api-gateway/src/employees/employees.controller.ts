import { Roles } from '@dexa/common';
import {
  createEmployeeRequestSchema,
  PHOTO_CONTENT_TYPE,
  Role,
  updateOwnProfileRequestSchema,
  type CreateEmployeeRequest,
  type EmployeeDetail,
  type OwnProfile,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  EMPLOYEE_SERVICE_CLIENT,
  type IEmployeeServiceClient,
} from './employee-service-client.interface.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';
import { readBearerToken } from '../auth/read-bearer-token.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

// The gateway forwards the caller's token, and employee-service takes the account from that token, so no account
// ID is read from the request here.
@Controller('employees')
export class EmployeesController {
  constructor(
    @Inject(EMPLOYEE_SERVICE_CLIENT) private readonly employeeService: IEmployeeServiceClient,
  ) {}

  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me')
  getOwnProfile(@Headers('authorization') authorization: string | undefined): Promise<OwnProfile> {
    return this.employeeService.getOwnProfile(readBearerToken(authorization));
  }

  // HR creates an employee (ADM-1). The body is validated strictly here and again by employee-service. The body holds
  // a password, so it is never logged. A matching retry answers 201 with the same employee, as a first create does.
  @Roles(Role.HR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createEmployee(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(createEmployeeRequestSchema)) request: CreateEmployeeRequest,
  ): Promise<EmployeeDetail> {
    return this.employeeService.createEmployee(readBearerToken(authorization), request);
  }

  // The body is strict, so only the phone number can change here. Name, email, position, and status stay read only.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Patch('me')
  updateOwnProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(updateOwnProfileRequestSchema)) request: UpdateOwnProfileRequest,
  ): Promise<OwnProfile> {
    return this.employeeService.updateOwnProfile(readBearerToken(authorization), request);
  }

  // The interceptor refuses an oversized upload before the body is buffered, so the file here is within the limit.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Put('me/photo')
  @UseInterceptors(PhotoUploadInterceptor)
  updateOwnPhoto(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFile() photo: Express.Multer.File,
  ): Promise<OwnProfile> {
    return this.employeeService.updateOwnPhoto(readBearerToken(authorization), photo.buffer);
  }

  // The photo is private to its owner, so no cache may keep it, and its type is fixed so it cannot render as markup.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async getOwnPhoto(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<StreamableFile> {
    const photo = await this.employeeService.getOwnPhoto(readBearerToken(authorization));
    return new StreamableFile(photo.body, { type: PHOTO_CONTENT_TYPE });
  }
}
