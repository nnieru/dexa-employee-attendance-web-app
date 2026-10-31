import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Drizzle generates the tables, keys, and checks below into migrations. Triggers and the updated_at
// function are hand-written SQL migrations, so Drizzle does not model them (see 0001).

// The outbox table is defined by @dexa/messaging. Re-exporting it here lets db:generate write its migration
// into this service's own migrations folder (DATABASE §2.2).
export { outboxEvents } from '@dexa/messaging';

export const masterEmployeeStatuses = pgTable(
  'master_employee_statuses',
  {
    id: uuid('id').notNull().defaultRandom(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'master_employee_statuses_id_pk', columns: [table.id] }),
    unique('master_employee_statuses_code_uq').on(table.code),
    check('master_employee_statuses_code_ck', sql`${table.code} ~ '^[A-Z0-9_]+$'`),
    check('master_employee_statuses_name_ck', sql`btrim(${table.name}) <> ''`),
  ],
);

export const masterPositions = pgTable(
  'master_positions',
  {
    id: uuid('id').notNull().defaultRandom(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'master_positions_id_pk', columns: [table.id] }),
    unique('master_positions_code_uq').on(table.code),
    check('master_positions_code_ck', sql`${table.code} ~ '^[A-Z0-9_]+$'`),
    check('master_positions_name_ck', sql`btrim(${table.name}) <> ''`),
  ],
);

// accountId is a logical reference to auth_db.accounts.id. No cross-database foreign key exists.
export const employees = pgTable(
  'employees',
  {
    accountId: uuid('account_id').notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    positionId: uuid('position_id').notNull(),
    employeeStatusId: uuid('employee_status_id').notNull(),
    // No default: the write path must supply the derived completion result (DATABASE §4.1).
    profileStatus: varchar('profile_status', { length: 20 }).notNull(),
    phoneNumber: varchar('phone_number', { length: 30 }),
    photoKey: text('photo_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'employees_account_id_pk', columns: [table.accountId] }),
    check('employees_name_ck', sql`btrim(${table.name}) <> ''`),
    foreignKey({
      name: 'employees_position_id_fk',
      columns: [table.positionId],
      foreignColumns: [masterPositions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'employees_employee_status_id_fk',
      columns: [table.employeeStatusId],
      foreignColumns: [masterEmployeeStatuses.id],
    }).onDelete('restrict'),
    check('employees_profile_status_ck', sql`${table.profileStatus} in ('INCOMPLETE', 'COMPLETE')`),
    // Restrictive master deletes and "deactivate position" checks look up employees by these columns.
    index('employees_position_id_idx').on(table.positionId),
    index('employees_employee_status_id_idx').on(table.employeeStatusId),
    index('employees_name_lower_idx').on(sql`lower(${table.name})`),
    // The double backslash keeps one backslash in the SQL, which the regular expression needs for "+".
    check(
      'employees_phone_number_ck',
      sql`${table.phoneNumber} is null or ${table.phoneNumber} ~ '^\\+?[0-9]{8,15}$'`,
    ),
    // The derived profile status must agree with the fields it is computed from, whatever the write path.
    check(
      'employees_profile_status_completion_ck',
      sql`(${table.profileStatus} = 'COMPLETE') = (${table.phoneNumber} is not null and btrim(${table.phoneNumber}) <> '' and ${table.photoKey} is not null and btrim(${table.photoKey}) <> '')`,
    ),
  ],
);

// accountId is a logical reference to auth_db.accounts.id, and it stays null until Auth returns an
// account, so the unique constraint allows many unbound operations (DATABASE §4.3).
export const employeeProvisioningOperations = pgTable(
  'employee_provisioning_operations',
  {
    operationId: uuid('operation_id').notNull(),
    actorAccountId: uuid('actor_account_id').notNull(),
    requestFingerprintSha256: varchar('request_fingerprint_sha256', { length: 64 }).notNull(),
    accountId: uuid('account_id'),
    state: varchar('state', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'employee_provisioning_operations_operation_id_pk',
      columns: [table.operationId],
    }),
    unique('employee_provisioning_operations_account_id_uq').on(table.accountId),
    check(
      'employee_provisioning_operations_request_fingerprint_sha256_ck',
      sql`${table.requestFingerprintSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'employee_provisioning_operations_state_ck',
      sql`${table.state} in ('RESERVED', 'PROFILE_SAVED', 'ACTIVE')`,
    ),
  ],
);

export type MasterPositionRow = typeof masterPositions.$inferSelect;
export type MasterEmployeeStatusRow = typeof masterEmployeeStatuses.$inferSelect;
export type EmployeeRow = typeof employees.$inferSelect;
export type EmployeeProvisioningOperationRow = typeof employeeProvisioningOperations.$inferSelect;
