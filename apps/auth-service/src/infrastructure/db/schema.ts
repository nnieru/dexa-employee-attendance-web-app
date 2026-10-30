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
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Drizzle generates the tables and constraints below into migrations. Triggers, the updated_at
// function, and seed rows are hand-written SQL migrations, so Drizzle does not model them.

// The outbox table is defined by @dexa/messaging. Re-exporting it here lets db:generate write its migration
// into this service's own migrations folder (DATABASE §2.2).
export { outboxEvents } from '@dexa/messaging';

export const masterRoles = pgTable(
  'master_roles',
  {
    id: uuid('id').notNull().defaultRandom(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'master_roles_id_pk', columns: [table.id] }),
    unique('master_roles_code_uq').on(table.code),
    check('master_roles_code_ck', sql`${table.code} ~ '^[A-Z0-9_]+$'`),
    check('master_roles_name_ck', sql`btrim(${table.name}) <> ''`),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').notNull().defaultRandom(),
    companyEmail: varchar('company_email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    roleId: uuid('role_id').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'accounts_id_pk', columns: [table.id] }),
    // Login emails are case-insensitive, so two accounts cannot differ only by letter case.
    uniqueIndex('accounts_company_email_uq').on(sql`lower(${table.companyEmail})`),
    index('accounts_role_id_idx').on(table.roleId),
    foreignKey({
      name: 'accounts_role_id_fk',
      columns: [table.roleId],
      foreignColumns: [masterRoles.id],
    }).onDelete('restrict'),
  ],
);

export const accountProvisioningOperations = pgTable(
  'account_provisioning_operations',
  {
    operationId: uuid('operation_id').notNull(),
    accountId: uuid('account_id').notNull(),
    actorAccountId: uuid('actor_account_id').notNull(),
    requestedEmail: varchar('requested_email', { length: 254 }).notNull(),
    requestedRole: varchar('requested_role', { length: 50 }).notNull(),
    initialPasswordHash: text('initial_password_hash').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'account_provisioning_operations_operation_id_pk',
      columns: [table.operationId],
    }),
    unique('account_provisioning_operations_account_id_uq').on(table.accountId),
    index('account_provisioning_operations_actor_account_id_idx').on(table.actorAccountId),
    foreignKey({
      name: 'account_provisioning_operations_account_id_fk',
      columns: [table.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'account_provisioning_operations_actor_account_id_fk',
      columns: [table.actorAccountId],
      foreignColumns: [accounts.id],
    }).onDelete('restrict'),
    check(
      'account_provisioning_operations_requested_role_ck',
      sql`${table.requestedRole} in ('EMPLOYEE', 'HR')`,
    ),
    check(
      'account_provisioning_operations_status_ck',
      sql`${table.status} in ('PENDING', 'ACTIVE')`,
    ),
  ],
);

export type MasterRoleRow = typeof masterRoles.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type AccountProvisioningOperationRow = typeof accountProvisioningOperations.$inferSelect;
