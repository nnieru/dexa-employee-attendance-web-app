import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Database = {
  db: ReturnType<typeof drizzle>;
  close: () => Promise<void>;
};

export type DatabaseOptions = {
  /** Called when an idle pooled connection fails, for example when PostgreSQL restarts. */
  readonly onIdleClientError?: (error: Error) => void;
};

/** Each service creates its own client from its own DATABASE_URL. Never share clients across services. */
export function createDatabase(databaseUrl: string, options: DatabaseOptions = {}): Database {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  // pg emits 'error' when an idle client loses its connection. Without a listener Node treats it as
  // unhandled and the process exits; the pool already drops the broken client and reconnects later.
  pool.on('error', options.onIdleClientError ?? warnIdleClientError);
  return { db: drizzle(pool), close: () => pool.end() };
}

// The message names the failure only; the connection string (which holds the password) is never included.
function warnIdleClientError(error: Error): void {
  process.emitWarning(`Idle database connection failed: ${error.name}: ${error.message}`, {
    code: 'DEXA_DB_IDLE_CLIENT_ERROR',
  });
}
