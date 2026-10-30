CREATE TABLE "account_provisioning_operations" (
	"operation_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"requested_email" varchar(254) NOT NULL,
	"requested_role" varchar(50) NOT NULL,
	"initial_password_hash" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provisioning_operations_operation_id_pk" PRIMARY KEY("operation_id"),
	CONSTRAINT "account_provisioning_operations_account_id_uq" UNIQUE("account_id"),
	CONSTRAINT "account_provisioning_operations_requested_role_ck" CHECK ("account_provisioning_operations"."requested_role" in ('EMPLOYEE', 'HR')),
	CONSTRAINT "account_provisioning_operations_status_ck" CHECK ("account_provisioning_operations"."status" in ('PENDING', 'ACTIVE'))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "master_roles" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_roles_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "master_roles_code_uq" UNIQUE("code"),
	CONSTRAINT "master_roles_code_ck" CHECK ("master_roles"."code" ~ '^[A-Z0-9_]+$'),
	CONSTRAINT "master_roles_name_ck" CHECK (btrim("master_roles"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "account_provisioning_operations" ADD CONSTRAINT "account_provisioning_operations_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_provisioning_operations" ADD CONSTRAINT "account_provisioning_operations_actor_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."master_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_provisioning_operations_actor_account_id_idx" ON "account_provisioning_operations" USING btree ("actor_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_company_email_uq" ON "accounts" USING btree (lower("company_email"));--> statement-breakpoint
CREATE INDEX "accounts_role_id_idx" ON "accounts" USING btree ("role_id");