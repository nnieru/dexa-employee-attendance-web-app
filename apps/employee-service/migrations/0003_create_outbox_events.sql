CREATE TABLE "outbox_events" (
	"id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	CONSTRAINT "outbox_events_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "outbox_events_payload_ck" CHECK (jsonb_typeof("outbox_events"."payload") = 'object'),
	CONSTRAINT "outbox_events_attempt_count_ck" CHECK ("outbox_events"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "outbox_events_next_attempt_at_created_at_idx" ON "outbox_events" USING btree ("next_attempt_at","created_at") WHERE "outbox_events"."published_at" is null;