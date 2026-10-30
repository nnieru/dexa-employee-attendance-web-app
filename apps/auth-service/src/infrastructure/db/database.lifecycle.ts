import { runMigrations, type Database } from '@dexa/db';
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { fileURLToPath } from 'node:url';
import { DATABASE } from './database.token.js';

// Resolved from this file, so the same relative path finds the reviewed migrations from src (tests)
// and from dist (the built service).
const AUTH_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../migrations', import.meta.url));

@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // Runs before the service listens, so a schema that cannot be applied stops startup instead of
  // failing on the first request.
  async onModuleInit(): Promise<void> {
    await runMigrations(this.database, AUTH_MIGRATIONS_FOLDER);
  }

  // Runs after every onModuleDestroy hook, so the outbox relay finishes its pass before the pool closes.
  async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}
