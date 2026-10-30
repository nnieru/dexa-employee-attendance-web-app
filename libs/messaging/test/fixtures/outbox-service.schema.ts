// The re-export a publishing service writes in its own schema.ts. drizzle-kit generate reads this file, which
// is how the outbox migration under outbox-migrations was produced.
export { outboxEvents } from '@dexa/messaging';
