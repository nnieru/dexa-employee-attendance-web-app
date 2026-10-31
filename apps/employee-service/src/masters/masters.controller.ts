import { GatewayUserAuthGuard, Roles, RolesGuard } from '@dexa/common';
import { Role, type MasterOption } from '@dexa/contracts';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  MASTER_LOOKUP_SERVICE,
  type IMasterLookupService,
} from './master-lookup.service.interface.js';

// Both lists are returned whole, without pagination. The catalogs are small, fixed by configuration
// (DATABASE §2), and HR selects from them, so a page would only split a short list. Every list that
// grows with data (employees, attendance) must still be paginated.
// The gateway checks the role too. This service checks it again, so the route stays closed if the
// gateway is bypassed.
@Controller()
@UseGuards(GatewayUserAuthGuard, RolesGuard)
@Roles(Role.HR)
export class MastersController {
  constructor(
    @Inject(MASTER_LOOKUP_SERVICE) private readonly masterLookups: IMasterLookupService,
  ) {}

  @Get('positions')
  listPositions(): Promise<MasterOption[]> {
    return this.masterLookups.listPositions();
  }

  @Get('employee-statuses')
  listEmployeeStatuses(): Promise<MasterOption[]> {
    return this.masterLookups.listEmployeeStatuses();
  }
}
