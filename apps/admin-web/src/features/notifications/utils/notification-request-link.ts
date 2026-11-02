import type { AttendanceRequestResourceType, Notification } from '@dexa/contracts';

type NotificationResource = Notification['data'];

const REQUEST_TYPE_BY_RESOURCE: Readonly<
  Record<AttendanceRequestResourceType, 'overtime' | 'correction'>
> = {
  overtime_request: 'overtime',
  attendance_adjustment_request: 'correction',
};

/**
 * The authorized detail path for an attendance request notification, or undefined for the other
 * notification types. Both resource fields are required, because a link without an ID cannot open a request.
 */
export function getNotificationRequestLink(
  data: NotificationResource,
): '/approvals/$requestType/$requestId' | undefined {
  if (data.resourceType === undefined || data.resourceId === undefined) return undefined;
  return '/approvals/$requestType/$requestId';
}

export function getNotificationRequestParams(data: NotificationResource):
  | {
      requestType: 'overtime' | 'correction';
      requestId: string;
    }
  | undefined {
  if (data.resourceType === undefined || data.resourceId === undefined) return undefined;
  return {
    requestType: REQUEST_TYPE_BY_RESOURCE[data.resourceType],
    requestId: data.resourceId,
  };
}
