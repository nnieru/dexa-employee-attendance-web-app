-- One function serves every table with updated_at (DATABASE §2.1). It sets the value on each UPDATE from the
-- database clock, so no writer can keep a stale timestamp or supply its own.
CREATE FUNCTION "set_updated_at"() RETURNS trigger
	LANGUAGE plpgsql
AS $$
BEGIN
	NEW."updated_at" := now();
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "master_attendance_statuses_set_updated_at"
	BEFORE UPDATE ON "master_attendance_statuses"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "work_schedules_set_updated_at"
	BEFORE UPDATE ON "work_schedules"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "work_calendar_dates_set_updated_at"
	BEFORE UPDATE ON "work_calendar_dates"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "attendance_days_set_updated_at"
	BEFORE UPDATE ON "attendance_days"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
-- Raw punches are original events (DATABASE §5.5). Neither UPDATE nor DELETE is allowed, through the application
-- or an ad-hoc query. Corrections change the effective state on attendance_days instead.
CREATE FUNCTION "attendance_entries_reject_change"() RETURNS trigger
	LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'attendance punches are immutable'
		USING ERRCODE = 'check_violation',
			TABLE = 'attendance_entries',
			CONSTRAINT = 'attendance_entries_immutable_ck';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "attendance_entries_reject_update"
	BEFORE UPDATE ON "attendance_entries"
	FOR EACH ROW
	EXECUTE FUNCTION "attendance_entries_reject_change"();--> statement-breakpoint
CREATE TRIGGER "attendance_entries_reject_delete"
	BEFORE DELETE ON "attendance_entries"
	FOR EACH ROW
	EXECUTE FUNCTION "attendance_entries_reject_change"();--> statement-breakpoint
-- The identity and the schedule/timezone/working-day snapshot are fixed when the day is created (DATABASE §5.4), so
-- a later schedule or calendar change never rewrites how a recorded day was classified (PRD SCH-6). The status,
-- revision, and effective-time columns stay writable.
CREATE FUNCTION "attendance_days_assert_snapshot_unchanged"() RETURNS trigger
	LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."id" IS DISTINCT FROM OLD."id"
		OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
		OR NEW."business_date" IS DISTINCT FROM OLD."business_date"
		OR NEW."work_schedule_id" IS DISTINCT FROM OLD."work_schedule_id"
		OR NEW."business_timezone" IS DISTINCT FROM OLD."business_timezone"
		OR NEW."is_working_day" IS DISTINCT FROM OLD."is_working_day"
		OR NEW."scheduled_start_at" IS DISTINCT FROM OLD."scheduled_start_at"
		OR NEW."scheduled_end_at" IS DISTINCT FROM OLD."scheduled_end_at" THEN
		RAISE EXCEPTION 'attendance day snapshot is immutable'
			USING ERRCODE = 'check_violation',
				TABLE = 'attendance_days',
				CONSTRAINT = 'attendance_days_snapshot_immutable_ck';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "attendance_days_assert_snapshot_unchanged"
	BEFORE UPDATE ON "attendance_days"
	FOR EACH ROW
	EXECUTE FUNCTION "attendance_days_assert_snapshot_unchanged"();
