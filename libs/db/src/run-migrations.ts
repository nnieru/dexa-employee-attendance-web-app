import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './create-database.js';

/** Applies reviewed, additive migrations only. Never call drizzle-kit push against shared data. */
export async function runMigrations(database: Database, migrationsFolder: string): Promise<void> {
  await migrate(database.db, { migrationsFolder });
}
