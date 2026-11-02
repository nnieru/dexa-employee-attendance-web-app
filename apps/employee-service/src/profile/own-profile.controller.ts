import {
  CurrentUser,
  GatewayUserAuthGuard,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  Role,
  updateOwnProfileRequestSchema,
  type OwnProfile,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { OWN_PHONE_SERVICE, type IOwnPhoneService } from './own-phone.service.interface.js';
import { OWN_PROFILE_SERVICE, type IOwnProfileService } from './own-profile.service.interface.js';

// The identity comes only from the verified token. A route with no account parameter cannot read or change
// another employee's profile, whatever the request carries.
@Controller('employees')
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE, Role.HR)
export class OwnProfileController {
  constructor(
    @Inject(OWN_PROFILE_SERVICE) private readonly ownProfiles: IOwnProfileService,
    @Inject(OWN_PHONE_SERVICE) private readonly ownPhones: IOwnPhoneService,
  ) {}

  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser): Promise<OwnProfile> {
    return this.ownProfiles.getOwnProfile(user.accountId);
  }

  // The service returns the committed change set for the profile-change event. This response is the
  // profile as stored after the change, so it is read once the change has committed.
  @Patch('me')
  async updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateOwnProfileRequestSchema)) request: UpdateOwnProfileRequest,
  ): Promise<OwnProfile> {
    await this.ownPhones.updatePhone(user.accountId, request);
    return this.ownProfiles.getOwnProfile(user.accountId);
  }
}
