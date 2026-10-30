import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/db/schema.ts',
  out: './migrations',
  dbCredentials: { url: process.env.ATTENDANCE_DATABASE_URL ?? '' },
});
