import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthenticatedUser } from '@dexa/common';
import { Role, type OwnProfile } from '@dexa/contracts';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { OWN_PROFILE_SERVICE, type IOwnProfileService } from './own-profile.service.interface.js';

// The identity comes only from the verified token. A route with no account parameter cannot read another
// employee's profile, whatever the request carries.
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE, Role.HR)
export class OwnProfileController {
  constructor(@Inject(OWN_PROFILE_SERVICE) private readonly ownProfiles: IOwnProfileService) {}

  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser): Promise<OwnProfile> {
    return this.ownProfiles.getOwnProfile(user.accountId);
  }
}
