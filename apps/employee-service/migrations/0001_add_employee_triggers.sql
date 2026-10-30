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
CREATE TRIGGER "master_employee_statuses_set_updated_at"
	BEFORE UPDATE ON "master_employee_statuses"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "master_positions_set_updated_at"
	BEFORE UPDATE ON "master_positions"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "employees_set_updated_at"
	BEFORE UPDATE ON "employees"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "employee_provisioning_operations_set_updated_at"
	BEFORE UPDATE ON "employee_provisioning_operations"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
-- A new assignment must reference an active master row. The check locks that row for share, so a
-- concurrent deactivation (which takes a conflicting row lock) waits for this transaction or commits
-- before the check runs. The trigger fires only for an INSERT or a changed reference, so an unchanged
-- reference on an existing employee stays valid after its master row is deactivated (DATABASE §4).
-- A reference to a missing master row is left to the foreign key, which reports it.
CREATE FUNCTION "employees_assert_assignable_masters"() RETURNS trigger
	LANGUAGE plpgsql
AS $$
DECLARE
	is_position_changed boolean;
	is_employee_status_changed boolean;
	is_position_active boolean;
	is_employee_status_active boolean;
BEGIN
	IF TG_OP = 'INSERT' THEN
		is_position_changed := true;
		is_employee_status_changed := true;
	ELSE
		is_position_changed := NEW."position_id" IS DISTINCT FROM OLD."position_id";
		is_employee_status_changed := NEW."employee_status_id" IS DISTINCT FROM OLD."employee_status_id";
	END IF;

	IF is_position_changed THEN
		SELECT "is_active" INTO is_position_active
		FROM "master_positions"
		WHERE "id" = NEW."position_id"
		FOR SHARE;
		IF FOUND AND NOT is_position_active THEN
			RAISE EXCEPTION 'position is not assignable'
				USING ERRCODE = 'check_violation',
					TABLE = 'employees',
					COLUMN = 'position_id',
					CONSTRAINT = 'employees_position_id_active_ck';
		END IF;
	END IF;

	IF is_employee_status_changed THEN
		SELECT "is_active" INTO is_employee_status_active
		FROM "master_employee_statuses"
		WHERE "id" = NEW."employee_status_id"
		FOR SHARE;
		IF FOUND AND NOT is_employee_status_active THEN
			RAISE EXCEPTION 'employee status is not assignable'
				USING ERRCODE = 'check_violation',
					TABLE = 'employees',
					COLUMN = 'employee_status_id',
					CONSTRAINT = 'employees_employee_status_id_active_ck';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "employees_assert_assignable_masters"
	BEFORE INSERT OR UPDATE OF "position_id", "employee_status_id" ON "employees"
	FOR EACH ROW
	EXECUTE FUNCTION "employees_assert_assignable_masters"();
