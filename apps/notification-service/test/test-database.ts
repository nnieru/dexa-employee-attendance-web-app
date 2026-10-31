import { createDatabase } from '@dexa/db';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Starting the container pulls an image on a cold machine, which exceeds Jest's 5 second default.
export const CONTAINER_TIMEOUT_MS = 120_000;
// Each test migrates a new database, which can exceed Jest's default.
export const TEST_TIMEOUT_MS = 30_000;
// The reviewed migrations, resolved from this file so specs can run them directly.
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export type DatabaseFailure = {
  readonly sqlState: string;
  readonly constraint: string | undefined;
};

// Each test gets an empty database, so no test can see rows that another test created.
export async function createEmptyDatabaseUri(serverUri: string): Promise<string> {
  const databaseName = `notification_${randomUUID().replaceAll('-', '')}`;
  const server = createDatabase(serverUri);
  try {
    await server.db.execute(sql`create database ${sql.identifier(databaseName)}`);
  } finally {
    await server.close();
  }
  const databaseUrl = new URL(serverUri);
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}

// Drizzle wraps the driver error. The SQLSTATE and constraint name are on the driver error held as cause.
export function findDatabaseFailure(error: unknown): DatabaseFailure | undefined {
  if (!(error instanceof Error)) return undefined;
  if ('code' in error && typeof error.code === 'string') {
    const constraint =
      'constraint' in error && typeof error.constraint === 'string' ? error.constraint : undefined;
    return { sqlState: error.code, constraint };
  }
  return findDatabaseFailure(error.cause);
}

export async function failureOf(statement: PromiseLike<unknown>): Promise<DatabaseFailure> {
  try {
    await statement;
  } catch (error) {
    const failure = findDatabaseFailure(error);
    if (failure === undefined) throw error;
    return failure;
  }
  throw new Error('Expected the statement to fail, but it succeeded.');
}

export function requireRow<TRow>(row: TRow | undefined): TRow {
  if (row === undefined) throw new Error('Expected a row, but the query returned none.');
  return row;
}
