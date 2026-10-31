import { EventName, type EmployeeLookupItem } from '@dexa/contracts';
import type { NotifiableEvent, NotifiableField } from './notifiable-event.rules.js';

/**
 * The name shown when Employee has no profile for the affected account (DATABASE §8: an unknown account is shown
 * as unavailable, not as an error that fails the whole notification).
 */
export const UNAVAILABLE_EMPLOYEE_NAME = 'Unavailable employee';

// Title limit of notifications.title (DATABASE §7.1).
const TITLE_MAX_LENGTH = 200;

// Readable label for each field name a contract may report. A field without a label fails type-checking, so a new
// contract field cannot reach the inbox unlabelled.
const FIELD_LABELS: Readonly<Record<NotifiableField, string>> = {
  phoneNumber: 'phone number',
  photo: 'photo',
  name: 'name',
  position: 'position',
  employeeStatus: 'employee status',
  profileStatus: 'profile status',
  password: 'password',
};

export type NotificationText = {
  readonly title: string;
  readonly body: string;
};

/** Labels the changed fields in the order the event listed them. */
export function describeChangedFields(fields: ReadonlyArray<NotifiableField>): string {
  return fields.map((field) => FIELD_LABELS[field]).join(', ');
}

/**
 * Builds the title and body from field names only, so no value, password, or token can reach the inbox.
 * `subjectName` is the employee's name as Employee or the event supplies it.
 */
export function describeNotification(
  event: NotifiableEvent,
  subjectName: string,
): NotificationText {
  const labels = describeChangedFields(event.changedFields);
  const body = `Changed fields: ${labels}.`;
  if (event.eventType === EventName.ACCOUNT_PASSWORD_CHANGED) {
    return { title: `${subjectName} changed their password`, body };
  }
  return { title: profileTitle(subjectName, labels), body };
}

// Falls back to a title without the field list when the list would overflow the title column.
function profileTitle(subjectName: string, labels: string): string {
  const detailedTitle = `${subjectName} updated: ${labels}`;
  if (detailedTitle.length <= TITLE_MAX_LENGTH) {
    return detailedTitle;
  }
  return `${subjectName} updated their profile`;
}

/** Picks the name for the account from a lookup answer, or the unavailable placeholder when Employee does not know it. */
export function resolveEmployeeName(
  employees: ReadonlyArray<EmployeeLookupItem>,
  accountId: string,
): string {
  const employee = employees.find((item) => item.accountId === accountId);
  return employee?.name ?? UNAVAILABLE_EMPLOYEE_NAME;
}
