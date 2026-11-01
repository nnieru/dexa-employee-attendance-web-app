import type { CorrectionRequestReviewPage, RequestReviewQueueQuery } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { EMPLOYEE_CLIENT, type IEmployeeClient } from '../employees/employee-client.interface.js';
import { findEmployeeNamesByAccountId } from '../employees/employee-name-lookup.js';
import {
  CORRECTION_REQUEST_REVIEW_READER,
  type ICorrectionRequestReviewReader,
} from './correction-request-review.repository.interface.js';
import type { ICorrectionRequestReviewService } from './correction-request-review.service.interface.js';
import {
  toCorrectionRequestReviewItem,
  toCorrectionRequestReviewPage,
} from './correction-request-review.rules.js';

@Injectable()
export class CorrectionRequestReviewService implements ICorrectionRequestReviewService {
  constructor(
    @Inject(CORRECTION_REQUEST_REVIEW_READER)
    private readonly reader: ICorrectionRequestReviewReader,
    @Inject(EMPLOYEE_CLIENT) private readonly employees: IEmployeeClient,
  ) {}

  // The page size is bounded by MAX_PAGE_SIZE, so the requesters of one page take one batched lookup.
  async listReviewQueue(
    reviewerAccountId: string,
    query: RequestReviewQueueQuery,
  ): Promise<CorrectionRequestReviewPage> {
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
      toCorrectionRequestReviewItem(record, reviewerAccountId, nameByAccountId),
    );
    return toCorrectionRequestReviewPage(items, query, totalItems);
  }
}
