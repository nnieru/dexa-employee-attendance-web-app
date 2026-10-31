/**
 * The queue that turns profile and password events into HR inbox rows (EVT-2). Its dead-letter queue is
 * `hr.notifications.dlq`, declared by connectEventConsumer (libs/messaging).
 */
export const HR_NOTIFICATIONS_QUEUE = 'hr.notifications';
