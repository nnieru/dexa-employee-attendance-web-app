import type { OvertimeRequestReviewPage, RequestReviewQueueQuery } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { EMPLOYEE_CLIENT, type IEmployeeClient } from '../employees/employee-client.interface.js';
import { findEmployeeNamesByAccountId } from '../employees/employee-name-lookup.js';
import {
  OVERTIME_REQUEST_REVIEW_READER,
  type IOvertimeRequestReviewReader,
} from './overtime-request-review.repository.interface.js';
import type { IOvertimeRequestReviewService } from './overtime-request-review.service.interface.js';
import {
  toOvertimeRequestReviewItem,
  toOvertimeRequestReviewPage,
} from './overtime-request-review.rules.js';

@Injectable()
export class OvertimeRequestReviewService implements IOvertimeRequestReviewService {
  constructor(
    @Inject(OVERTIME_REQUEST_REVIEW_READER) private readonly reader: IOvertimeRequestReviewReader,
    @Inject(EMPLOYEE_CLIENT) private readonly employees: IEmployeeClient,
  ) {}

  // The page size is bounded by MAX_PAGE_SIZE, so the requesters of one page take one batched lookup.
  async listReviewQueue(
    reviewerAccountId: string,
    query: RequestReviewQueueQuery,
  ): Promise<OvertimeRequestReviewPage> {
    const { records, totalItems } = await this.reader.findReviewPage({
      status: query.status,
      requesterAccountId: query.employeeId,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    });
    const nameByAccountId = await findEmployeeNamesByAccountId(
      this.employees,
      records.map((record) => record.requesterAccountId),
    );
    const items = records.map((record) =>
      toOvertimeRequestReviewItem(record, reviewerAccountId, nameByAccountId),
    );
    return toOvertimeRequestReviewPage(items, query, totalItems);
  }
}
