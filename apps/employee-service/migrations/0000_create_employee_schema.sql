CREATE TABLE "employee_provisioning_operations" (
	"operation_id" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"request_fingerprint_sha256" varchar(64) NOT NULL,
	"account_id" uuid,
	"state" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_provisioning_operations_operation_id_pk" PRIMARY KEY("operation_id"),
	CONSTRAINT "employee_provisioning_operations_account_id_uq" UNIQUE("account_id"),
	CONSTRAINT "employee_provisioning_operations_request_fingerprint_sha256_ck" CHECK ("employee_provisioning_operations"."request_fingerprint_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "employee_provisioning_operations_state_ck" CHECK ("employee_provisioning_operations"."state" in ('RESERVED', 'PROFILE_SAVED', 'ACTIVE'))
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"account_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"position_id" uuid NOT NULL,
	"employee_status_id" uuid NOT NULL,
	"profile_status" varchar(20) NOT NULL,
	"phone_number" varchar(30),
	"photo_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_account_id_pk" PRIMARY KEY("account_id"),
	CONSTRAINT "employees_name_ck" CHECK (btrim("employees"."name") <> ''),
	CONSTRAINT "employees_profile_status_ck" CHECK ("employees"."profile_status" in ('INCOMPLETE', 'COMPLETE'))
);
--> statement-breakpoint
CREATE TABLE "master_employee_statuses" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_employee_statuses_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "master_employee_statuses_code_uq" UNIQUE("code"),
	CONSTRAINT "master_employee_statuses_code_ck" CHECK ("master_employee_statuses"."code" ~ '^[A-Z0-9_]+$'),
	CONSTRAINT "master_employee_statuses_name_ck" CHECK (btrim("master_employee_statuses"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "master_positions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_positions_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "master_positions_code_uq" UNIQUE("code"),
	CONSTRAINT "master_positions_code_ck" CHECK ("master_positions"."code" ~ '^[A-Z0-9_]+$'),
	CONSTRAINT "master_positions_name_ck" CHECK (btrim("master_positions"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."master_positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_employee_status_id_fk" FOREIGN KEY ("employee_status_id") REFERENCES "public"."master_employee_statuses"("id") ON DELETE restrict ON UPDATE no action;