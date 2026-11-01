import { DependencyUnavailableError } from '@dexa/common';
import { ErrorCode, type EmployeeLookupItem } from '@dexa/contracts';
import type { IAuthClient } from '../src/ingestion/auth-client.interface.js';
import type { IEmployeeClient } from '../src/ingestion/employee-client.interface.js';
import type { NotificationDraft } from '../src/ingestion/notification-row.rules.js';
import type { INotificationPublisher } from '../src/ingestion/notification-publisher.interface.js';
import type {
  INotificationWriter,
  InsertedNotification,
} from '../src/ingestion/notification-writer.interface.js';

/** The error an outage of Auth or Employee produces at the client boundary. */
export function dependencyOutage(): DependencyUnavailableError {
  return new DependencyUnavailableError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Unavailable.');
}

/**
 * Stands in for auth-service. Answers with the given recipients, and fails its first `failuresBeforeSuccess`
 * calls, which stands in for an outage that clears. Counts every call, so a test can wait for a redelivery.
 */
export class ScriptedAuthClient implements IAuthClient {
  calls = 0;
  private remainingFailures: number;

  constructor(
    private readonly recipientAccountIds: ReadonlyArray<string>,
    failuresBeforeSuccess: number,
  ) {
    this.remainingFailures = failuresBeforeSuccess;
  }

  async listHrRecipientIds(): Promise<ReadonlyArray<string>> {
    this.calls += 1;
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw dependencyOutage();
    }
    return this.recipientAccountIds;
  }
}

/**
 * Stands in for employee-service's batched lookup. Fails its first `failuresBeforeSuccess` calls. Unknown accounts
 * are absent from the answer, as in production.
 */
export class ScriptedEmployeeClient implements IEmployeeClient {
  calls = 0;
  private remainingFailures: number;

  constructor(
    private readonly employees: ReadonlyArray<EmployeeLookupItem>,
    failuresBeforeSuccess: number,
  ) {
    this.remainingFailures = failuresBeforeSuccess;
  }

  async lookupEmployees(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]> {
    this.calls += 1;
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw dependencyOutage();
    }
    return this.employees.filter((employee) => accountIds.includes(employee.accountId));
  }
}

/** Wraps the real writer and counts completed commits, so a test can wait for the commit it expects. */
export class CountingNotificationWriter implements INotificationWriter {
  commits = 0;

  constructor(private readonly delegate: INotificationWriter) {}

  async insertForRecipients(
    drafts: ReadonlyArray<NotificationDraft>,
  ): Promise<ReadonlyArray<InsertedNotification>> {
    const inserted = await this.delegate.insertForRecipients(drafts);
    this.commits += 1;
    return inserted;
  }
}

/**
 * Stands in for the live stream. Counts each push and keeps the rows it was given, so a test can show that only the
 * rows a call inserted were pushed, and that a redelivery pushed nothing.
 */
export class RecordingNotificationPublisher implements INotificationPublisher {
  pushCount = 0;
  readonly pushedNotifications: InsertedNotification[] = [];

  publish(notifications: ReadonlyArray<InsertedNotification>): void {
    this.pushCount += 1;
    this.pushedNotifications.push(...notifications);
  }
}
