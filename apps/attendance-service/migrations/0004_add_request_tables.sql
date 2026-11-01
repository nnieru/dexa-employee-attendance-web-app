CREATE TABLE "attendance_adjustment_requests" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"attendance_day_id" uuid NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_account_id" uuid,
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"base_revision" integer NOT NULL,
	"before_checkin_at" timestamp with time zone,
	"before_checkout_at" timestamp with time zone,
	"before_day_status_category" varchar(20) GENERATED ALWAYS AS ('DAY') STORED NOT NULL,
	"before_day_status_id" uuid NOT NULL,
	"requested_checkin_at" timestamp with time zone,
	"requested_checkout_at" timestamp with time zone,
	"requested_day_status_category" varchar(20) GENERATED ALWAYS AS ('DAY') STORED NOT NULL,
	"requested_day_status_id" uuid NOT NULL,
	"applied_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_adjustment_requests_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "attendance_adjustment_requests_requester_idempotency_uq" UNIQUE("requested_by_account_id","idempotency_key"),
	CONSTRAINT "attendance_adjustment_requests_status_ck" CHECK ("attendance_adjustment_requests"."status" in ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "attendance_adjustment_requests_reason_ck" CHECK (btrim("attendance_adjustment_requests"."reason") <> ''),
	CONSTRAINT "attendance_adjustment_requests_review_identity_ck" CHECK (("attendance_adjustment_requests"."status" = 'PENDING' and "attendance_adjustment_requests"."reviewed_by_account_id" is null and "attendance_adjustment_requests"."reviewed_at" is null) or ("attendance_adjustment_requests"."status" <> 'PENDING' and "attendance_adjustment_requests"."reviewed_by_account_id" is not null and "attendance_adjustment_requests"."reviewed_at" is not null)),
	CONSTRAINT "attendance_adjustment_requests_self_review_ck" CHECK ("attendance_adjustment_requests"."reviewed_by_account_id" is null or "attendance_adjustment_requests"."reviewed_by_account_id" <> "attendance_adjustment_requests"."requested_by_account_id"),
	CONSTRAINT "attendance_adjustment_requests_reviewed_at_ck" CHECK ("attendance_adjustment_requests"."reviewed_at" is null or "attendance_adjustment_requests"."reviewed_at" >= "attendance_adjustment_requests"."created_at"),
	CONSTRAINT "attendance_adjustment_requests_rejection_reason_ck" CHECK ("attendance_adjustment_requests"."status" <> 'REJECTED' or ("attendance_adjustment_requests"."review_reason" is not null and btrim("attendance_adjustment_requests"."review_reason") <> '')),
	CONSTRAINT "attendance_adjustment_requests_pending_review_reason_ck" CHECK ("attendance_adjustment_requests"."status" <> 'PENDING' or "attendance_adjustment_requests"."review_reason" is null),
	CONSTRAINT "attendance_adjustment_requests_base_revision_ck" CHECK ("attendance_adjustment_requests"."base_revision" >= 1),
	CONSTRAINT "attendance_adjustment_requests_checkout_order_ck" CHECK ("attendance_adjustment_requests"."requested_checkout_at" is null or "attendance_adjustment_requests"."requested_checkin_at" is null or "attendance_adjustment_requests"."requested_checkout_at" >= "attendance_adjustment_requests"."requested_checkin_at"),
	CONSTRAINT "attendance_adjustment_requests_checkout_needs_checkin_ck" CHECK ("attendance_adjustment_requests"."requested_checkout_at" is null or "attendance_adjustment_requests"."requested_checkin_at" is not null),
	CONSTRAINT "attendance_adjustment_requests_applied_revision_ck" CHECK (("attendance_adjustment_requests"."status" = 'APPROVED') = ("attendance_adjustment_requests"."applied_revision" is not null))
);
--> statement-breakpoint
CREATE TABLE "overtime_requests" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"attendance_day_id" uuid NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_account_id" uuid,
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"requested_start_at" timestamp with time zone NOT NULL,
	"requested_end_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overtime_requests_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "overtime_requests_requester_idempotency_uq" UNIQUE("requested_by_account_id","idempotency_key"),
	CONSTRAINT "overtime_requests_status_ck" CHECK ("overtime_requests"."status" in ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "overtime_requests_reason_ck" CHECK (btrim("overtime_requests"."reason") <> ''),
	CONSTRAINT "overtime_requests_review_identity_ck" CHECK (("overtime_requests"."status" = 'PENDING' and "overtime_requests"."reviewed_by_account_id" is null and "overtime_requests"."reviewed_at" is null) or ("overtime_requests"."status" <> 'PENDING' and "overtime_requests"."reviewed_by_account_id" is not null and "overtime_requests"."reviewed_at" is not null)),
	CONSTRAINT "overtime_requests_self_review_ck" CHECK ("overtime_requests"."reviewed_by_account_id" is null or "overtime_requests"."reviewed_by_account_id" <> "overtime_requests"."requested_by_account_id"),
	CONSTRAINT "overtime_requests_reviewed_at_ck" CHECK ("overtime_requests"."reviewed_at" is null or "overtime_requests"."reviewed_at" >= "overtime_requests"."created_at"),
	CONSTRAINT "overtime_requests_rejection_reason_ck" CHECK ("overtime_requests"."status" <> 'REJECTED' or ("overtime_requests"."review_reason" is not null and btrim("overtime_requests"."review_reason") <> '')),
	CONSTRAINT "overtime_requests_pending_review_reason_ck" CHECK ("overtime_requests"."status" <> 'PENDING' or "overtime_requests"."review_reason" is null),
	CONSTRAINT "overtime_requests_requested_order_ck" CHECK ("overtime_requests"."requested_end_at" > "overtime_requests"."requested_start_at")
);
--> statement-breakpoint
ALTER TABLE "attendance_adjustment_requests" ADD CONSTRAINT "attendance_adjustment_requests_attendance_day_fk" FOREIGN KEY ("attendance_day_id","requested_by_account_id") REFERENCES "public"."attendance_days"("id","account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_adjustment_requests" ADD CONSTRAINT "attendance_adjustment_requests_before_day_status_fk" FOREIGN KEY ("before_day_status_id","before_day_status_category") REFERENCES "public"."master_attendance_statuses"("id","category") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_adjustment_requests" ADD CONSTRAINT "attendance_adjustment_requests_requested_day_status_fk" FOREIGN KEY ("requested_day_status_id","requested_day_status_category") REFERENCES "public"."master_attendance_statuses"("id","category") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_attendance_day_fk" FOREIGN KEY ("attendance_day_id","requested_by_account_id") REFERENCES "public"."attendance_days"("id","account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_adjustment_requests_pending_day_uq" ON "attendance_adjustment_requests" USING btree ("attendance_day_id") WHERE "attendance_adjustment_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "attendance_adjustment_requests_status_created_at_idx" ON "attendance_adjustment_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "attendance_adjustment_requests_attendance_day_created_at_idx" ON "attendance_adjustment_requests" USING btree ("attendance_day_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_adjustment_requests_before_day_status_id_idx" ON "attendance_adjustment_requests" USING btree ("before_day_status_id");--> statement-breakpoint
CREATE INDEX "attendance_adjustment_requests_requested_day_status_id_idx" ON "attendance_adjustment_requests" USING btree ("requested_day_status_id");--> statement-breakpoint
CREATE INDEX "overtime_requests_status_created_at_idx" ON "overtime_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "overtime_requests_attendance_day_created_at_idx" ON "overtime_requests" USING btree ("attendance_day_id","created_at");