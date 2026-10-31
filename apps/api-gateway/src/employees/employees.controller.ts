import { CurrentUser, Roles, type AuthenticatedUser } from '@dexa/common';
import {
  accountIdSchema,
  createEmployeeRequestSchema,
  employeeListQuerySchema,
  PHOTO_CONTENT_TYPE,
  photoThumbnailRequestSchema,
  Role,
  updateEmployeeRequestSchema,
  updateOwnProfileRequestSchema,
  type CreateEmployeeRequest,
  type EmployeeDetail,
  type EmployeeListPage,
  type EmployeeListQuery,
  type OwnProfile,
  type PhotoThumbnailRequest,
  type PhotoThumbnailResponse,
  type UpdateEmployeeRequest,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  EMPLOYEE_SERVICE_CLIENT,
  type IEmployeeServiceClient,
} from './employee-service-client.interface.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';

// The gateway forwards the caller's identity, and employee-service takes the account from that identity, so no account
// ID is read from the request here.
@Controller('employees')
export class EmployeesController {
  constructor(
    @Inject(EMPLOYEE_SERVICE_CLIENT) private readonly employeeService: IEmployeeServiceClient,
  ) {}

  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser): Promise<OwnProfile> {
    return this.employeeService.getOwnProfile(user);
  }

  // HR's roster (ADM-3). The query is validated here and again by employee-service. HR accounts are listed too (D-14).
  @Roles(Role.HR)
  @Get()
  listEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(employeeListQuerySchema)) query: EmployeeListQuery,
  ): Promise<EmployeeListPage> {
    return this.employeeService.listEmployees(user, query);
  }

  // HR creates an employee (ADM-1). The body is validated strictly here and again by employee-service. The body holds
  // a password, so it is never logged. A matching retry answers 201 with the same employee, as a first create does.
  @Roles(Role.HR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEmployeeRequestSchema)) request: CreateEmployeeRequest,
  ): Promise<EmployeeDetail> {
    return this.employeeService.createEmployee(user, request);
  }

  // The body is strict, so only the phone number can change here. Name, email, position, and status stay read only.
  // This route is declared before the HR route below, so the static `me` segment is matched first.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Patch('me')
  updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateOwnProfileRequestSchema)) request: UpdateOwnProfileRequest,
  ): Promise<OwnProfile> {
    return this.employeeService.updateOwnProfile(user, request);
  }

  // HR updates an employee (ADM-2). The body is strict and validated here and again by employee-service. It can carry a
  // new password, so it is never logged. A partial failure answers 503 with the steps that saved, and it is not retried.
  @Roles(Role.HR)
  @Patch(':accountId')
  updateEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ZodValidationPipe(accountIdSchema)) accountId: string,
    @Body(new ZodValidationPipe(updateEmployeeRequestSchema)) request: UpdateEmployeeRequest,
  ): Promise<EmployeeDetail> {
    return this.employeeService.updateEmployee(user, accountId, request);
  }

  // The interceptor refuses an oversized upload before the body is buffered, so the file here is within the limit.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Put('me/photo')
  @UseInterceptors(PhotoUploadInterceptor)
  updateOwnPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() photo: Express.Multer.File,
  ): Promise<OwnProfile> {
    return this.employeeService.updateOwnPhoto(user, photo.buffer);
  }

  // The photo is private to its owner, so no cache may keep it, and its type is fixed so it cannot render as markup.
  @Roles(Role.EMPLOYEE, Role.HR)
  @Get('me/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async getOwnPhoto(@CurrentUser() user: AuthenticatedUser): Promise<StreamableFile> {
    const photo = await this.employeeService.getOwnPhoto(user);
    return new StreamableFile(photo.body, { type: PHOTO_CONTENT_TYPE });
  }

  // HR's view of an employee photo for the list thumbnails (ADM-3). This route is declared after `me/photo`, so the
  // static segment is matched first and `me` never reaches the UUID check.
  @Roles(Role.HR)
  @Get(':accountId/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async getEmployeePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ZodValidationPipe(accountIdSchema)) accountId: string,
  ): Promise<StreamableFile> {
    const photo = await this.employeeService.getEmployeePhoto(user, accountId);
    return new StreamableFile(photo.body, { type: PHOTO_CONTENT_TYPE });
  }

  // HR's batched thumbnails for the employee list (D-57). One request per page: the body holds at most 100 unique IDs,
  // checked here and again by employee-service. A POST that reads answers 200, and it is never retried by the gateway.
  @Roles(Role.HR)
  @Post('photo-thumbnails')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  getPhotoThumbnails(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(photoThumbnailRequestSchema)) request: PhotoThumbnailRequest,
  ): Promise<PhotoThumbnailResponse> {
    return this.employeeService.getPhotoThumbnails(user, request);
  }
}
