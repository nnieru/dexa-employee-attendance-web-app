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
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Drizzle generates the tables, keys, and checks below into migrations. Hand-written SQL migrations add
// the exclusion constraint, the weekday check function, the updated_at trigger, the immutability triggers,
// and the status seed (see the migration files), because Drizzle does not model them.

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

// The company schedule versions (DATABASE §5.2). The no-overlap rule is an exclusion constraint in
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
    // Baseline schedules do not cross midnight (DATABASE §9, decision 4).
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

// Company calendar exceptions (DATABASE §5.3). A row overrides the regular working weekdays for its date.
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
    // accepts only a status of the matching category (DATABASE §5.1). They are not written by the app.
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
    // Lets request tables prove ownership with a composite foreign key (DATABASE §5.6–5.7).
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

// Raw punches (DATABASE §5.5). The table has no updated_at, and a trigger in migration 0001 rejects
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

export type MasterAttendanceStatusRow = typeof masterAttendanceStatuses.$inferSelect;
export type WorkScheduleRow = typeof workSchedules.$inferSelect;
export type WorkCalendarDateRow = typeof workCalendarDates.$inferSelect;
export type AttendanceDayRow = typeof attendanceDays.$inferSelect;
export type AttendanceEntryRow = typeof attendanceEntries.$inferSelect;
