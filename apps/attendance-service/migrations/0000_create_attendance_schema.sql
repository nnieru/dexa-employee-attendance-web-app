CREATE TABLE "attendance_days" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"work_schedule_id" uuid NOT NULL,
	"business_timezone" text NOT NULL,
	"is_working_day" boolean NOT NULL,
	"scheduled_start_at" timestamp with time zone,
	"scheduled_end_at" timestamp with time zone,
	"day_status_category" varchar(20) GENERATED ALWAYS AS ('DAY') STORED NOT NULL,
	"day_status_id" uuid NOT NULL,
	"checkin_status_category" varchar(20) GENERATED ALWAYS AS ('CHECK_IN') STORED NOT NULL,
	"checkin_status_id" uuid NOT NULL,
	"checkout_status_category" varchar(20) GENERATED ALWAYS AS ('CHECK_OUT') STORED NOT NULL,
	"checkout_status_id" uuid NOT NULL,
	"effective_checkin_at" timestamp with time zone,
	"effective_checkout_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_days_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "attendance_days_account_id_business_date_uq" UNIQUE("account_id","business_date"),
	CONSTRAINT "attendance_days_id_account_id_uq" UNIQUE("id","account_id"),
	CONSTRAINT "attendance_days_business_timezone_ck" CHECK (btrim("attendance_days"."business_timezone") <> ''),
	CONSTRAINT "attendance_days_revision_ck" CHECK ("attendance_days"."revision" >= 1),
	CONSTRAINT "attendance_days_scheduled_order_ck" CHECK ("attendance_days"."scheduled_start_at" is null or "attendance_days"."scheduled_end_at" is null or "attendance_days"."scheduled_start_at" < "attendance_days"."scheduled_end_at"),
	CONSTRAINT "attendance_days_working_day_schedule_ck" CHECK (not "attendance_days"."is_working_day" or ("attendance_days"."scheduled_start_at" is not null and "attendance_days"."scheduled_end_at" is not null)),
	CONSTRAINT "attendance_days_effective_checkout_ck" CHECK ("attendance_days"."effective_checkout_at" is null or ("attendance_days"."effective_checkin_at" is not null and "attendance_days"."effective_checkin_at" <= "attendance_days"."effective_checkout_at"))
);
--> statement-breakpoint
CREATE TABLE "attendance_entries" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"attendance_day_id" uuid NOT NULL,
	"type" varchar(10) NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attendance_entries_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "attendance_entries_attendance_day_id_type_uq" UNIQUE("attendance_day_id","type"),
	CONSTRAINT "attendance_entries_type_ck" CHECK ("attendance_entries"."type" in ('IN', 'OUT'))
);
--> statement-breakpoint
CREATE TABLE "master_attendance_statuses" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(150) NOT NULL,
	"category" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_attendance_statuses_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "master_attendance_statuses_code_uq" UNIQUE("code"),
	CONSTRAINT "master_attendance_statuses_id_category_uq" UNIQUE("id","category"),
	CONSTRAINT "master_attendance_statuses_code_ck" CHECK ("master_attendance_statuses"."code" ~ '^[A-Z0-9_]+$'),
	CONSTRAINT "master_attendance_statuses_name_ck" CHECK (btrim("master_attendance_statuses"."name") <> ''),
	CONSTRAINT "master_attendance_statuses_category_ck" CHECK ("master_attendance_statuses"."category" in ('DAY', 'CHECK_IN', 'CHECK_OUT'))
);
--> statement-breakpoint
CREATE TABLE "work_calendar_dates" (
	"business_date" date NOT NULL,
	"is_working_day" boolean NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_calendar_dates_business_date_pk" PRIMARY KEY("business_date"),
	CONSTRAINT "work_calendar_dates_description_ck" CHECK ("work_calendar_dates"."description" is null or btrim("work_calendar_dates"."description") <> '')
);
--> statement-breakpoint
CREATE TABLE "work_schedules" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"timezone" text NOT NULL,
	"working_weekdays" smallint[] NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"late_checkin_grace_minutes" integer NOT NULL,
	"early_checkout_grace_minutes" integer NOT NULL,
	"late_checkout_grace_minutes" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_schedules_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "work_schedules_name_ck" CHECK (btrim("work_schedules"."name") <> ''),
	CONSTRAINT "work_schedules_timezone_ck" CHECK (btrim("work_schedules"."timezone") <> ''),
	CONSTRAINT "work_schedules_time_order_ck" CHECK ("work_schedules"."start_time" < "work_schedules"."end_time"),
	CONSTRAINT "work_schedules_late_checkin_grace_ck" CHECK ("work_schedules"."late_checkin_grace_minutes" >= 0),
	CONSTRAINT "work_schedules_early_checkout_grace_ck" CHECK ("work_schedules"."early_checkout_grace_minutes" >= 0),
	CONSTRAINT "work_schedules_late_checkout_grace_ck" CHECK ("work_schedules"."late_checkout_grace_minutes" >= 0),
	CONSTRAINT "work_schedules_effective_until_ck" CHECK ("work_schedules"."effective_until" is null or "work_schedules"."effective_until" > "work_schedules"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_work_schedule_id_fk" FOREIGN KEY ("work_schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_day_status_fk" FOREIGN KEY ("day_status_id","day_status_category") REFERENCES "public"."master_attendance_statuses"("id","category") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_checkin_status_fk" FOREIGN KEY ("checkin_status_id","checkin_status_category") REFERENCES "public"."master_attendance_statuses"("id","category") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_checkout_status_fk" FOREIGN KEY ("checkout_status_id","checkout_status_category") REFERENCES "public"."master_attendance_statuses"("id","category") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_attendance_day_id_fk" FOREIGN KEY ("attendance_day_id") REFERENCES "public"."attendance_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_days_business_date_account_id_idx" ON "attendance_days" USING btree ("business_date","account_id");--> statement-breakpoint
CREATE INDEX "attendance_days_work_schedule_id_idx" ON "attendance_days" USING btree ("work_schedule_id");--> statement-breakpoint
CREATE INDEX "attendance_days_day_status_id_idx" ON "attendance_days" USING btree ("day_status_id");--> statement-breakpoint
CREATE INDEX "attendance_days_checkin_status_id_idx" ON "attendance_days" USING btree ("checkin_status_id");--> statement-breakpoint
CREATE INDEX "attendance_days_checkout_status_id_idx" ON "attendance_days" USING btree ("checkout_status_id");