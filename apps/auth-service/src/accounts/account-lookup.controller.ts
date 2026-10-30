import { ServiceAuthGuard } from '@dexa/common';
import {
  accountEmailQuerySchema,
  accountIdSchema,
  accountLookupRequestSchema,
  paginationQuerySchema,
  type AccountEmailQuery,
  type AccountIdPage,
  type AccountLookupItem,
  type AccountLookupRequest,
  type AccountReference,
  type AccountSearchResponse,
  type AccountStatus,
  type PaginationQuery,
} from '@dexa/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  ACCOUNT_LOOKUP_SERVICE,
  type IAccountLookupService,
} from './account-lookup-service.interface.js';

// Every service may call these routes with a service token addressed to auth-service. Each caller needs a
// different subset, so the routes do not restrict callers to an allowlist.
@Controller('internal/accounts')
@UseGuards(ServiceAuthGuard)
export class AccountLookupController {
  constructor(@Inject(ACCOUNT_LOOKUP_SERVICE) private readonly lookups: IAccountLookupService) {}

  // POST because the ID list is too large for a query string. The call only reads, so it answers 200.
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookupAccounts(
    @Body(new ZodValidationPipe(accountLookupRequestSchema)) request: AccountLookupRequest,
  ): Promise<AccountLookupItem[]> {
    return this.lookups.lookupAccounts(request.ids);
  }

  @Get('hr-recipients')
  listHrRecipients(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<AccountIdPage> {
    return this.lookups.listHrRecipientIds(query);
  }

  @Get('search')
  searchAccounts(
    @Query(new ZodValidationPipe(accountEmailQuerySchema)) query: AccountEmailQuery,
  ): Promise<AccountSearchResponse> {
    return this.lookups.searchAccounts(query.email);
  }

  @Get('by-email')
  findAccountByEmail(
    @Query(new ZodValidationPipe(accountEmailQuerySchema)) query: AccountEmailQuery,
  ): Promise<AccountReference> {
    return this.lookups.findAccountByEmail(query.email);
  }

  @Get(':id/status')
  getAccountStatus(
    @Param('id', new ZodValidationPipe(accountIdSchema)) accountId: string,
  ): Promise<AccountStatus> {
    return this.lookups.getAccountStatus(accountId);
  }
}
