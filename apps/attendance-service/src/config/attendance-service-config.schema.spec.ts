import { parseConfig } from '@dexa/common';
import { attendanceServiceEnvironment } from '../../test/attendance-service-environment.js';
import { AttendanceServiceConfigSchema } from './attendance-service-config.schema.js';

const DEFAULT_SCHEDULE = {
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
};

function parseWith(overrides: Record<string, string | undefined>) {
  return parseConfig(AttendanceServiceConfigSchema, attendanceServiceEnvironment(overrides));
}

function rejectionOf(overrides: Record<string, string | undefined>): string {
  try {
    parseWith(overrides);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected the configuration to be rejected, but it was accepted.');
}

describe('AttendanceServiceConfigSchema default schedule', () => {
  it('should use the PRD defaults when no schedule variable is set', () => {
    expect(parseWith({}).ATTENDANCE_DEFAULT_SCHEDULE).toEqual(DEFAULT_SCHEDULE);
  });

  it('should use the defaults when a schedule variable is blank', () => {
    const config = parseWith({
      ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: '  ',
      ATTENDANCE_DEFAULT_SCHEDULE_START_TIME: '',
      ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKIN_GRACE_MINUTES: '',
    });

    expect(config.ATTENDANCE_DEFAULT_SCHEDULE).toEqual(DEFAULT_SCHEDULE);
  });

  it('should read weekdays in any order with spaces and return them sorted', () => {
    const config = parseWith({ ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: '5, 1 ,7' });

    expect(config.ATTENDANCE_DEFAULT_SCHEDULE.workingWeekdays).toEqual([1, 5, 7]);
  });

  it.each([
    {
      condition: 'a weekday is 0',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: '0,1' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS',
    },
    {
      condition: 'a weekday is 8',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: '1,8' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS',
    },
    {
      condition: 'a weekday is a name',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: 'Mon,Tue' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS',
    },
    {
      condition: 'an entry is empty',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: '1,,2' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS',
    },
    {
      condition: 'a weekday repeats',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: '1,1' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS',
    },
    {
      condition: 'the start time has one hour digit',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_START_TIME: '9:00' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_START_TIME',
    },
    {
      condition: 'the start time is 24:00',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_START_TIME: '24:00' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_START_TIME',
    },
    {
      condition: 'the end time is not after the start time',
      overrides: {
        ATTENDANCE_DEFAULT_SCHEDULE_START_TIME: '09:00',
        ATTENDANCE_DEFAULT_SCHEDULE_END_TIME: '09:00',
      },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_END_TIME',
    },
    {
      condition: 'a grace period is negative',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKIN_GRACE_MINUTES: '-1' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKIN_GRACE_MINUTES',
    },
    {
      condition: 'a grace period is not a whole number',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_EARLY_CHECKOUT_GRACE_MINUTES: '1.5' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_EARLY_CHECKOUT_GRACE_MINUTES',
    },
    {
      condition: 'a grace period exceeds the integer column',
      overrides: { ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKOUT_GRACE_MINUTES: '2147483648' },
      field: 'ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKOUT_GRACE_MINUTES',
    },
  ])('should reject the configuration when $condition', ({ overrides, field }) => {
    expect(rejectionOf(overrides)).toContain(`${field}: `);
  });

  it('should report the field name and never the rejected value', () => {
    const message = rejectionOf({ ATTENDANCE_DEFAULT_SCHEDULE_START_TIME: 'secret-value' });

    expect(message).toContain('ATTENDANCE_DEFAULT_SCHEDULE_START_TIME');
    expect(message).not.toContain('secret-value');
  });
});

describe('AttendanceServiceConfigSchema ATTENDANCE_DATABASE_URL', () => {
  it('should reject the configuration when the database URL is not a postgres URL', () => {
    expect(rejectionOf({ ATTENDANCE_DATABASE_URL: 'mysql://app:pw@host:3306/db' })).toContain(
      'ATTENDANCE_DATABASE_URL: must be a postgres:// connection URL',
    );
  });

  it('should reject the configuration when the database URL names no database', () => {
    expect(rejectionOf({ ATTENDANCE_DATABASE_URL: 'postgres://app:pw@127.0.0.1:5432' })).toContain(
      'ATTENDANCE_DATABASE_URL: must name a host and a database',
    );
  });
});

describe('AttendanceServiceConfigSchema RABBITMQ_URL', () => {
  it('should reject the configuration when the broker URL is not an amqp URL', () => {
    expect(rejectionOf({ RABBITMQ_URL: 'http://127.0.0.1:5672' })).toContain(
      'RABBITMQ_URL: must be an amqp:// or amqps:// connection URL',
    );
  });
});
