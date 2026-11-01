import type { CorrectionRequestPage, OwnRequestListQuery } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { toCorrectionRequestPage } from './correction-request.rules.js';
import {
  CORRECTION_REQUEST_LIST_READER,
  type ICorrectionRequestListReader,
} from './correction-request-list.repository.interface.js';
import type { ICorrectionRequestListService } from './correction-request-list.service.interface.js';

@Injectable()
export class CorrectionRequestListService implements ICorrectionRequestListService {
  constructor(
    @Inject(CORRECTION_REQUEST_LIST_READER) private readonly reader: ICorrectionRequestListReader,
  ) {}

  async listOwnRequests(
    accountId: string,
    query: OwnRequestListQuery,
  ): Promise<CorrectionRequestPage> {
    const { records, totalItems } = await this.reader.findOwnRequestPage({
      accountId,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
    return toCorrectionRequestPage(records, query, totalItems);
  }
}
