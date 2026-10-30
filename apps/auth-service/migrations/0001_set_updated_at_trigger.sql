-- One function serves every table with updated_at. It sets the value on each UPDATE from the database
-- clock, so no writer can keep a stale timestamp or supply its own.
CREATE FUNCTION "set_updated_at"() RETURNS trigger
	LANGUAGE plpgsql
AS $$
BEGIN
	NEW."updated_at" := now();
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "master_roles_set_updated_at"
	BEFORE UPDATE ON "master_roles"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "accounts_set_updated_at"
	BEFORE UPDATE ON "accounts"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "account_provisioning_operations_set_updated_at"
	BEFORE UPDATE ON "account_provisioning_operations"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
