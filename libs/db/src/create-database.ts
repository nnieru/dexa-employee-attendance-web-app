import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Database = {
  db: ReturnType<typeof drizzle>;
  close: () => Promise<void>;
};

/** Each service creates its own client from its own DATABASE_URL. Never share clients across services. */
export function createDatabase(databaseUrl: string): Database {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  return { db: drizzle(pool), close: () => pool.end() };
}
