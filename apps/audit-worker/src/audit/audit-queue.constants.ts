/**
 * The queue that records profile-change and password-change events. Its dead-letter queue is
 * `audit.profile-changes.dlq`, declared by connectEventConsumer (libs/messaging).
 */
export const AUDIT_PROFILE_CHANGES_QUEUE = 'audit.profile-changes';
