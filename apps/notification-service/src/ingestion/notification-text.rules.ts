import {
  EventName,
  type AttendanceRequestResourceType,
  type EmployeeLookupItem,
} from '@dexa/contracts';
import type { NotifiableEvent, NotifiableField } from './notifiable-event.rules.js';

/**
 * The name shown when Employee has no profile for the affected account (an unknown account is shown
 * as unavailable, not as an error that fails the whole notification).
 */
export const UNAVAILABLE_EMPLOYEE_NAME = 'Unavailable employee';

// Title limit of notifications.title.
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
 * `subjectName` is the employee's name as Employee or the event supplies it. For an attendance request it is the
 * requester's name.
 */
export function describeNotification(
  event: NotifiableEvent,
  subjectName: string,
): NotificationText {
  if (event.eventType === EventName.ATTENDANCE_REQUEST_SUBMITTED) {
    return describeAttendanceRequest({
      resourceType: event.resourceType,
      businessDate: event.businessDate,
      requesterName: subjectName,
    });
  }
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

// The phrase after the requester's name. The article is part of the phrase, so both titles read as sentences.
const REQUEST_PHRASES: Readonly<Record<AttendanceRequestResourceType, string>> = {
  overtime_request: 'overtime',
  attendance_adjustment_request: 'an attendance correction',
};

export type AttendanceRequestTextInput = {
  readonly resourceType: AttendanceRequestResourceType;
  readonly businessDate: string;
  readonly requesterName: string;
};

/**
 * Builds the title and body for an attendance request submitted by an employee. The event carries no
 * reason, so the text names the request kind and business date only. Employee caps names at 150 characters, so the
 * longest title still fits the 200-character column.
 */
export function describeAttendanceRequest(input: AttendanceRequestTextInput): NotificationText {
  const phrase = REQUEST_PHRASES[input.resourceType];
  return {
    title: `${input.requesterName} requested ${phrase} for ${input.businessDate}`,
    body: 'Open the request to review it.',
  };
}

/** Picks the name for the account from a lookup answer, or the unavailable placeholder when Employee does not know it. */
export function resolveEmployeeName(
  employees: ReadonlyArray<EmployeeLookupItem>,
  accountId: string,
): string {
  const employee = employees.find((item) => item.accountId === accountId);
  return employee?.name ?? UNAVAILABLE_EMPLOYEE_NAME;
}
