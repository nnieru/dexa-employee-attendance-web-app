CREATE TABLE "notifications" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"recipient_account_id" uuid NOT NULL,
	"subject_account_id" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "notifications_event_id_recipient_account_id_uq" UNIQUE("event_id","recipient_account_id"),
	CONSTRAINT "notifications_data_ck" CHECK (jsonb_typeof("notifications"."data") = 'object'),
	CONSTRAINT "notifications_read_at_created_at_ck" CHECK ("notifications"."read_at" is null or "notifications"."read_at" >= "notifications"."created_at")
);
--> statement-breakpoint
CREATE INDEX "notifications_recipient_account_id_created_at_id_idx" ON "notifications" USING btree ("recipient_account_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "notifications_recipient_account_id_created_at_id_unread_idx" ON "notifications" USING btree ("recipient_account_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "notifications"."read_at" is null;