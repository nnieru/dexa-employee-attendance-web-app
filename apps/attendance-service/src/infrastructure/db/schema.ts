import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Drizzle generates the tables, keys, and checks below into migrations. Hand-written SQL migrations add
// the exclusion constraints, the weekday check function, the updated_at triggers, the immutability triggers,
// and the status seed (see the migration files), because Drizzle does not model them.

// The outbox table is defined by @dexa/messaging. Re-exporting it here lets db:generate write its migration
// into this service's own migrations folder.
export { outboxEvents } from '@dexa/messaging';

export const masterAttendanceStatuses = pgTable(
  'master_attendance_statuses',
  {
    id: uuid('id').notNull().defaultRandom(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    category: varchar('category', { length: 20 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'master_attendance_statuses_id_pk', columns: [table.id] }),
    unique('master_attendance_statuses_code_uq').on(table.code),
    // Target of the composite foreign keys from attendance_days, so each status proves its category.
    unique('master_attendance_statuses_id_category_uq').on(table.id, table.category),
    check('master_attendance_statuses_code_ck', sql`${table.code} ~ '^[A-Z0-9_]+$'`),
    check('master_attendance_statuses_name_ck', sql`btrim(${table.name}) <> ''`),
    check(
      'master_attendance_statuses_category_ck',
      sql`${table.category} in ('DAY', 'CHECK_IN', 'CHECK_OUT')`,
    ),
  ],
);

// The company schedule versions. The no-overlap rule is an exclusion constraint in
// migration 0002, and the weekday rule is a check function in migration 0002.
export const workSchedules = pgTable(
  'work_schedules',
  {
    id: uuid('id').notNull().defaultRandom(),
    name: varchar('name', { length: 150 }).notNull(),
    timezone: text('timezone').notNull(),
    workingWeekdays: smallint('working_weekdays').array().notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    lateCheckinGraceMinutes: integer('late_checkin_grace_minutes').notNull(),
    earlyCheckoutGraceMinutes: integer('early_checkout_grace_minutes').notNull(),
    lateCheckoutGraceMinutes: integer('late_checkout_grace_minutes').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    // Exclusive. Null means the version has no end yet.
    effectiveUntil: date('effective_until'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'work_schedules_id_pk', columns: [table.id] }),
    check('work_schedules_name_ck', sql`btrim(${table.name}) <> ''`),
    check('work_schedules_timezone_ck', sql`btrim(${table.timezone}) <> ''`),
    // Baseline schedules do not cross midnight.
    check('work_schedules_time_order_ck', sql`${table.startTime} < ${table.endTime}`),
    check('work_schedules_late_checkin_grace_ck', sql`${table.lateCheckinGraceMinutes} >= 0`),
    check('work_schedules_early_checkout_grace_ck', sql`${table.earlyCheckoutGraceMinutes} >= 0`),
    check('work_schedules_late_checkout_grace_ck', sql`${table.lateCheckoutGraceMinutes} >= 0`),
    check(
      'work_schedules_effective_until_ck',
      sql`${table.effectiveUntil} is null or ${table.effectiveUntil} > ${table.effectiveFrom}`,
    ),
  ],
);

// Company calendar exceptions. A row overrides the regular working weekdays for its date.
export const workCalendarDates = pgTable(
  'work_calendar_dates',
  {
    businessDate: date('business_date').notNull(),
    isWorkingDay: boolean('is_working_day').notNull(),
    description: varchar('description', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'work_calendar_dates_business_date_pk', columns: [table.businessDate] }),
    check(
      'work_calendar_dates_description_ck',
      sql`${table.description} is null or btrim(${table.description}) <> ''`,
    ),
  ],
);

// accountId is a logical reference to auth_db.accounts.id. No cross-database foreign key exists.
// The snapshot columns (businessTimezone, isWorkingDay, scheduledStartAt, scheduledEndAt) and the
// identity columns are immutable after insert, enforced by a trigger in migration 0001.
export const attendanceDays = pgTable(
  'attendance_days',
  {
    id: uuid('id').notNull().defaultRandom(),
    accountId: uuid('account_id').notNull(),
    businessDate: date('business_date').notNull(),
    workScheduleId: uuid('work_schedule_id').notNull(),
    businessTimezone: text('business_timezone').notNull(),
    isWorkingDay: boolean('is_working_day').notNull(),
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }),
    // Stored constants: each status column pairs with one of these, so the composite foreign key
    // accepts only a status of the matching category. They are not written by the app.
    dayStatusCategory: varchar('day_status_category', { length: 20 })
      .notNull()
      .generatedAlwaysAs(sql`'DAY'`),
    dayStatusId: uuid('day_status_id').notNull(),
    checkinStatusCategory: varchar('checkin_status_category', { length: 20 })
      .notNull()
      .generatedAlwaysAs(sql`'CHECK_IN'`),
    checkinStatusId: uuid('checkin_status_id').notNull(),
    checkoutStatusCategory: varchar('checkout_status_category', { length: 20 })
      .notNull()
      .generatedAlwaysAs(sql`'CHECK_OUT'`),
    checkoutStatusId: uuid('checkout_status_id').notNull(),
    effectiveCheckinAt: timestamp('effective_checkin_at', { withTimezone: true }),
    effectiveCheckoutAt: timestamp('effective_checkout_at', { withTimezone: true }),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'attendance_days_id_pk', columns: [table.id] }),
    unique('attendance_days_account_id_business_date_uq').on(table.accountId, table.businessDate),
    // Lets request tables prove ownership with a composite foreign key.
    unique('attendance_days_id_account_id_uq').on(table.id, table.accountId),
    foreignKey({
      name: 'attendance_days_work_schedule_id_fk',
      columns: [table.workScheduleId],
      foreignColumns: [workSchedules.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'attendance_days_day_status_fk',
      columns: [table.dayStatusId, table.dayStatusCategory],
      foreignColumns: [masterAttendanceStatuses.id, masterAttendanceStatuses.category],
    }),
    foreignKey({
      name: 'attendance_days_checkin_status_fk',
      columns: [table.checkinStatusId, table.checkinStatusCategory],
      foreignColumns: [masterAttendanceStatuses.id, masterAttendanceStatuses.category],
    }),
    foreignKey({
      name: 'attendance_days_checkout_status_fk',
      columns: [table.checkoutStatusId, table.checkoutStatusCategory],
      foreignColumns: [masterAttendanceStatuses.id, masterAttendanceStatuses.category],
    }),
    index('attendance_days_business_date_account_id_idx').on(table.businessDate, table.accountId),
    index('attendance_days_work_schedule_id_idx').on(table.workScheduleId),
    index('attendance_days_day_status_id_idx').on(table.dayStatusId),
    index('attendance_days_checkin_status_id_idx').on(table.checkinStatusId),
    index('attendance_days_checkout_status_id_idx').on(table.checkoutStatusId),
    check('attendance_days_business_timezone_ck', sql`btrim(${table.businessTimezone}) <> ''`),
    check('attendance_days_revision_ck', sql`${table.revision} >= 1`),
    check(
      'attendance_days_scheduled_order_ck',
      sql`${table.scheduledStartAt} is null or ${table.scheduledEndAt} is null or ${table.scheduledStartAt} < ${table.scheduledEndAt}`,
    ),
    check(
      'attendance_days_working_day_schedule_ck',
      sql`not ${table.isWorkingDay} or (${table.scheduledStartAt} is not null and ${table.scheduledEndAt} is not null)`,
    ),
    check(
      'attendance_days_effective_checkout_ck',
      sql`${table.effectiveCheckoutAt} is null or (${table.effectiveCheckinAt} is not null and ${table.effectiveCheckinAt} <= ${table.effectiveCheckoutAt})`,
    ),
  ],
);

// Raw punches. The table has no updated_at, and a trigger in migration 0001 rejects
// UPDATE and DELETE, so recordedAt and type never change after insert.
export const attendanceEntries = pgTable(
  'attendance_entries',
  {
    id: uuid('id').notNull().defaultRandom(),
    attendanceDayId: uuid('attendance_day_id').notNull(),
    type: varchar('type', { length: 10 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'attendance_entries_id_pk', columns: [table.id] }),
    foreignKey({
      name: 'attendance_entries_attendance_day_id_fk',
      columns: [table.attendanceDayId],
      foreignColumns: [attendanceDays.id],
    }).onDelete('restrict'),
    // The leading column of this unique key also serves the foreign key, so no separate index is added.
    unique('attendance_entries_attendance_day_id_type_uq').on(table.attendanceDayId, table.type),
    check('attendance_entries_type_ck', sql`${table.type} in ('IN', 'OUT')`),
  ],
);

// Overtime requests. accountId is the verified requester; it must own the day, which the
// composite foreign key proves. The overlap exclusion constraint is hand-written SQL (migration 0005), because
// Drizzle does not model exclusion constraints with a partial predicate.
// The requester and the review fields are logical account references, so no cross-database foreign key exists.
export const overtimeRequests = pgTable(
  'overtime_requests',
  {
    id: uuid('id').notNull().defaultRandom(),
    attendanceDayId: uuid('attendance_day_id').notNull(),
    requestedByAccountId: uuid('requested_by_account_id').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    reviewedByAccountId: uuid('reviewed_by_account_id'),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    requestedStartAt: timestamp('requested_start_at', { withTimezone: true }).notNull(),
    requestedEndAt: timestamp('requested_end_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'overtime_requests_id_pk', columns: [table.id] }),
    foreignKey({
      name: 'overtime_requests_attendance_day_fk',
      columns: [table.attendanceDayId, table.requestedByAccountId],
      foreignColumns: [attendanceDays.id, attendanceDays.accountId],
    }).onDelete('restrict'),
    unique('overtime_requests_requester_idempotency_uq').on(
      table.requestedByAccountId,
      table.idempotencyKey,
    ),
    index('overtime_requests_status_created_at_idx').on(table.status, table.createdAt),
    index('overtime_requests_attendance_day_created_at_idx').on(
      table.attendanceDayId,
      table.createdAt,
    ),
    check(
      'overtime_requests_status_ck',
      sql`${table.status} in ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
    check('overtime_requests_reason_ck', sql`btrim(${table.reason}) <> ''`),
    check(
      'overtime_requests_review_identity_ck',
      sql`(${table.status} = 'PENDING' and ${table.reviewedByAccountId} is null and ${table.reviewedAt} is null) or (${table.status} <> 'PENDING' and ${table.reviewedByAccountId} is not null and ${table.reviewedAt} is not null)`,
    ),
    check(
      'overtime_requests_self_review_ck',
      sql`${table.reviewedByAccountId} is null or ${table.reviewedByAccountId} <> ${table.requestedByAccountId}`,
    ),
    check(
      'overtime_requests_reviewed_at_ck',
      sql`${table.reviewedAt} is null or ${table.reviewedAt} >= ${table.createdAt}`,
    ),
    // A null review_reason must fail the rejection rule, so the NULL-safe form is written out. A CHECK that
    // evaluates to NULL passes, so `btrim(NULL) <> ''` alone would let a rejection without a reason through.
    check(
      'overtime_requests_rejection_reason_ck',
      sql`${table.status} <> 'REJECTED' or (${table.reviewReason} is not null and btrim(${table.reviewReason}) <> '')`,
    ),
    check(
      'overtime_requests_pending_review_reason_ck',
      sql`${table.status} <> 'PENDING' or ${table.reviewReason} is null`,
    ),
    check(
      'overtime_requests_requested_order_ck',
      sql`${table.requestedEndAt} > ${table.requestedStartAt}`,
    ),
  ],
);

// Attendance corrections. The before-snapshot and the requested values are fixed at
// submission; the request-immutability trigger in migration 0005 enforces that. The partial unique index keeps
// one PENDING correction per day.
export const attendanceAdjustmentRequests = pgTable(
  'attendance_adjustment_requests',
  {
    id: uuid('id').notNull().defaultRandom(),
    attendanceDayId: uuid('attendance_day_id').notNull(),
    requestedByAccountId: uuid('requested_by_account_id').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    reviewedByAccountId: uuid('reviewed_by_account_id'),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    baseRevision: integer('base_revision').notNull(),
    beforeCheckinAt: timestamp('before_checkin_at', { withTimezone: true }),
    beforeCheckoutAt: timestamp('before_checkout_at', { withTimezone: true }),
    // Stored constants that pin each status column to the DAY category, as attendance_days does.
    beforeDayStatusCategory: varchar('before_day_status_category', { length: 20 })
      .notNull()
      .generatedAlwaysAs(sql`'DAY'`),
    beforeDayStatusId: uuid('before_day_status_id').notNull(),
    requestedCheckinAt: timestamp('requested_checkin_at', { withTimezone: true }),
    requestedCheckoutAt: timestamp('requested_checkout_at', { withTimezone: true }),
    requestedDayStatusCategory: varchar('requested_day_status_category', { length: 20 })
      .notNull()
      .generatedAlwaysAs(sql`'DAY'`),
    requestedDayStatusId: uuid('requested_day_status_id').notNull(),
    appliedRevision: integer('applied_revision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'attendance_adjustment_requests_id_pk', columns: [table.id] }),
    foreignKey({
      name: 'attendance_adjustment_requests_attendance_day_fk',
      columns: [table.attendanceDayId, table.requestedByAccountId],
      foreignColumns: [attendanceDays.id, attendanceDays.accountId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'attendance_adjustment_requests_before_day_status_fk',
      columns: [table.beforeDayStatusId, table.beforeDayStatusCategory],
      foreignColumns: [masterAttendanceStatuses.id, masterAttendanceStatuses.category],
    }),
    foreignKey({
      name: 'attendance_adjustment_requests_requested_day_status_fk',
      columns: [table.requestedDayStatusId, table.requestedDayStatusCategory],
      foreignColumns: [masterAttendanceStatuses.id, masterAttendanceStatuses.category],
    }),
    unique('attendance_adjustment_requests_requester_idempotency_uq').on(
      table.requestedByAccountId,
      table.idempotencyKey,
    ),
    // Only one PENDING correction per day. Terminal requests do not count, so a new one can follow a rejection.
    uniqueIndex('attendance_adjustment_requests_pending_day_uq')
      .on(table.attendanceDayId)
      .where(sql`${table.status} = 'PENDING'`),
    index('attendance_adjustment_requests_status_created_at_idx').on(table.status, table.createdAt),
    index('attendance_adjustment_requests_attendance_day_created_at_idx').on(
      table.attendanceDayId,
      table.createdAt,
    ),
    index('attendance_adjustment_requests_before_day_status_id_idx').on(table.beforeDayStatusId),
    index('attendance_adjustment_requests_requested_day_status_id_idx').on(
      table.requestedDayStatusId,
    ),
    check(
      'attendance_adjustment_requests_status_ck',
      sql`${table.status} in ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
    check('attendance_adjustment_requests_reason_ck', sql`btrim(${table.reason}) <> ''`),
    check(
      'attendance_adjustment_requests_review_identity_ck',
      sql`(${table.status} = 'PENDING' and ${table.reviewedByAccountId} is null and ${table.reviewedAt} is null) or (${table.status} <> 'PENDING' and ${table.reviewedByAccountId} is not null and ${table.reviewedAt} is not null)`,
    ),
    check(
      'attendance_adjustment_requests_self_review_ck',
      sql`${table.reviewedByAccountId} is null or ${table.reviewedByAccountId} <> ${table.requestedByAccountId}`,
    ),
    check(
      'attendance_adjustment_requests_reviewed_at_ck',
      sql`${table.reviewedAt} is null or ${table.reviewedAt} >= ${table.createdAt}`,
    ),
    // NULL-safe form for the same reason as overtime_requests_rejection_reason_ck.
    check(
      'attendance_adjustment_requests_rejection_reason_ck',
      sql`${table.status} <> 'REJECTED' or (${table.reviewReason} is not null and btrim(${table.reviewReason}) <> '')`,
    ),
    check(
      'attendance_adjustment_requests_pending_review_reason_ck',
      sql`${table.status} <> 'PENDING' or ${table.reviewReason} is null`,
    ),
    check('attendance_adjustment_requests_base_revision_ck', sql`${table.baseRevision} >= 1`),
    check(
      'attendance_adjustment_requests_checkout_order_ck',
      sql`${table.requestedCheckoutAt} is null or ${table.requestedCheckinAt} is null or ${table.requestedCheckoutAt} >= ${table.requestedCheckinAt}`,
    ),
    check(
      'attendance_adjustment_requests_checkout_needs_checkin_ck',
      sql`${table.requestedCheckoutAt} is null or ${table.requestedCheckinAt} is not null`,
    ),
    check(
      'attendance_adjustment_requests_applied_revision_ck',
      sql`(${table.status} = 'APPROVED') = (${table.appliedRevision} is not null)`,
    ),
  ],
);

export type MasterAttendanceStatusRow = typeof masterAttendanceStatuses.$inferSelect;
export type WorkScheduleRow = typeof workSchedules.$inferSelect;
export type WorkCalendarDateRow = typeof workCalendarDates.$inferSelect;
export type AttendanceDayRow = typeof attendanceDays.$inferSelect;
export type AttendanceEntryRow = typeof attendanceEntries.$inferSelect;
