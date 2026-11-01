import {
  attendanceRequestEventPayloadSchema,
  ATTENDANCE_REQUEST_RESOURCE_TYPES,
} from './attendance-request.schema.js';

const ACCOUNT_ID = '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f';
const ACTOR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const RESOURCE_ID = 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d';

const VALID_PAYLOAD = {
  accountId: ACCOUNT_ID,
  actorAccountId: ACTOR_ACCOUNT_ID,
  resourceType: ATTENDANCE_REQUEST_RESOURCE_TYPES[0],
  resourceId: RESOURCE_ID,
  businessDate: '2026-11-02',
  changedFields: [],
};

describe('attendanceRequestEventPayloadSchema', () => {
  it.each(ATTENDANCE_REQUEST_RESOURCE_TYPES)(
    'should accept valid payload for resource type %s',
    (resourceType) => {
      expect(
        attendanceRequestEventPayloadSchema.safeParse({ ...VALID_PAYLOAD, resourceType }).success,
      ).toBe(true);
    },
  );

  it.each([
    { condition: 'a reason key is present', extra: { reason: 'Work late' } },
    { condition: 'a reviewReason key is present', extra: { reviewReason: 'Approved' } },
    { condition: 'a status key is present', extra: { status: 'APPROVED' } },
    { condition: 'an oldValues key is present', extra: { oldValues: {} } },
    { condition: 'a newValues key is present', extra: { newValues: {} } },
  ])('should reject the payload when $condition', ({ extra }) => {
    expect(
      attendanceRequestEventPayloadSchema.safeParse({ ...VALID_PAYLOAD, ...extra }).success,
    ).toBe(false);
  });

  it('should reject when changedFields is not empty', () => {
    expect(
      attendanceRequestEventPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        changedFields: ['something'],
      }).success,
    ).toBe(false);
  });

  it('should reject when resourceType is invalid', () => {
    expect(
      attendanceRequestEventPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        resourceType: 'unknown_type',
      }).success,
    ).toBe(false);
  });

  it('should reject when resourceId is not a UUID', () => {
    expect(
      attendanceRequestEventPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        resourceId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('should reject when businessDate is not an ISO date', () => {
    expect(
      attendanceRequestEventPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        businessDate: '2026-02-30',
      }).success,
    ).toBe(false);
  });
});
