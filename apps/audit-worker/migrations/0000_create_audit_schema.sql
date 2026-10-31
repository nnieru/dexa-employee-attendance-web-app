CREATE TABLE "audit_logs" (
	"event_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"resource_type" varchar(50),
	"resource_id" uuid,
	"source_service" varchar(40) NOT NULL,
	"account_id" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_logs_event_id_pk" PRIMARY KEY("event_id"),
	CONSTRAINT "audit_logs_changed_fields_ck" CHECK (jsonb_typeof("audit_logs"."changed_fields") = 'array'),
	CONSTRAINT "audit_logs_resource_type_resource_id_ck" CHECK (("audit_logs"."resource_type" is null) = ("audit_logs"."resource_id" is null))
);
--> statement-breakpoint
CREATE TABLE "dlq_messages" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"event_id" uuid,
	"source_queue" varchar(255) NOT NULL,
	"payload" "bytea" NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempt_count" integer NOT NULL,
	"last_error" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"first_failed_at" timestamp with time zone NOT NULL,
	"last_failed_at" timestamp with time zone NOT NULL,
	"requeued_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "dlq_messages_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "dlq_messages_source_queue_message_id_uq" UNIQUE("source_queue","message_id"),
	CONSTRAINT "dlq_messages_attempt_count_ck" CHECK ("dlq_messages"."attempt_count" >= 1),
	CONSTRAINT "dlq_messages_status_ck" CHECK ("dlq_messages"."status" in ('PENDING', 'REQUEUED', 'RESOLVED')),
	CONSTRAINT "dlq_messages_last_failed_at_first_failed_at_ck" CHECK ("dlq_messages"."last_failed_at" >= "dlq_messages"."first_failed_at"),
	CONSTRAINT "dlq_messages_resolved_at_status_ck" CHECK (("dlq_messages"."status" = 'RESOLVED') = ("dlq_messages"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "audit_logs_account_id_occurred_at_idx" ON "audit_logs" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_type_resource_id_occurred_at_idx" ON "audit_logs" USING btree ("resource_type","resource_id","occurred_at");--> statement-breakpoint
CREATE INDEX "dlq_messages_status_last_failed_at_idx" ON "dlq_messages" USING btree ("status","last_failed_at");--> statement-breakpoint
CREATE INDEX "dlq_messages_event_id_idx" ON "dlq_messages" USING btree ("event_id");