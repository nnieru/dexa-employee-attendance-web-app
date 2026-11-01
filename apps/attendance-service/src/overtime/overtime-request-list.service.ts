import type { OvertimeRequestPage, OwnRequestListQuery } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  OVERTIME_REQUEST_LIST_READER,
  type IOvertimeRequestListReader,
} from './overtime-request-list.repository.interface.js';
import type { IOvertimeRequestListService } from './overtime-request-list.service.interface.js';
import { toOvertimeRequestPage } from './overtime-request.rules.js';

@Injectable()
export class OvertimeRequestListService implements IOvertimeRequestListService {
  constructor(
    @Inject(OVERTIME_REQUEST_LIST_READER) private readonly reader: IOvertimeRequestListReader,
  ) {}

  async listOwnRequests(
    accountId: string,
    query: OwnRequestListQuery,
  ): Promise<OvertimeRequestPage> {
    const { records, totalItems } = await this.reader.findOwnRequestPage({
      accountId,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
    return toOvertimeRequestPage(records, query, totalItems);
  }
}
