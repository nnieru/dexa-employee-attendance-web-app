import { EventName } from '@dexa/contracts';
import {
  buildAttendanceRequestEvent,
  type AttendanceRequestEventInput,
} from './attendance-request-event.rules.js';

const VALID_INPUT: AttendanceRequestEventInput = {
  eventId: 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d',
  eventType: EventName.ATTENDANCE_REQUEST_SUBMITTED,
  occurredAt: new Date('2026-11-02T10:00:00.000Z'),
  accountId: '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f',
  actorAccountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  resourceType: 'overtime_request',
  resourceId: '3f7e2d1c-8b4a-4e9f-9c0d-1a2b3c4d5e6f',
  businessDate: '2026-11-02',
};

describe('buildAttendanceRequestEvent', () => {
  it('should build a valid EventMessage for submission', () => {
    const event = buildAttendanceRequestEvent(VALID_INPUT);
    expect(event).toEqual({
      eventId: VALID_INPUT.eventId,
      type: EventName.ATTENDANCE_REQUEST_SUBMITTED,
      occurredAt: '2026-11-02T10:00:00.000Z',
      payload: {
        accountId: VALID_INPUT.accountId,
        actorAccountId: VALID_INPUT.actorAccountId,
        resourceType: 'overtime_request',
        resourceId: VALID_INPUT.resourceId,
        businessDate: '2026-11-02',
        changedFields: [],
      },
    });
  });

  it('should build a valid EventMessage for approval', () => {
    const event = buildAttendanceRequestEvent({
      ...VALID_INPUT,
      eventType: EventName.ATTENDANCE_REQUEST_APPROVED,
      resourceType: 'attendance_adjustment_request',
    });
    expect(event.type).toBe(EventName.ATTENDANCE_REQUEST_APPROVED);
    expect((event.payload as { resourceType: string }).resourceType).toBe(
      'attendance_adjustment_request',
    );
  });

  it('should build a valid EventMessage for rejection', () => {
    const event = buildAttendanceRequestEvent({
      ...VALID_INPUT,
      eventType: EventName.ATTENDANCE_REQUEST_REJECTED,
    });
    expect(event.type).toBe(EventName.ATTENDANCE_REQUEST_REJECTED);
  });
});
