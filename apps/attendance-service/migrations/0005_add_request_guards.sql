-- Overtime overlap guard (DATABASE §5.7). PENDING and APPROVED intervals of one account may not overlap; REJECTED
-- requests do not block a replacement (OT-5). Half-open ranges let back-to-back intervals touch. btree_gist supplies
-- the uuid equality operator for the GiST index. The migration role owns attendance_db and btree_gist is a trusted
-- extension (PostgreSQL 13+), so the owner may create it without superuser rights.
CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_no_overlap" EXCLUDE USING gist ("requested_by_account_id" WITH =, tstzrange("requested_start_at", "requested_end_at", '[)') WITH &&) WHERE ("status" IN ('PENDING', 'APPROVED'));--> statement-breakpoint
-- Request fields are fixed at submission and the decision is final (DATABASE §5.6). A terminal request keeps its
-- status and review fields, so a decided request can never return to PENDING or be decided again. updated_at is
-- excluded from the comparison because set_updated_at maintains it.
CREATE FUNCTION "overtime_requests_assert_unchanged"() RETURNS trigger
	LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."id" IS DISTINCT FROM OLD."id"
		OR NEW."attendance_day_id" IS DISTINCT FROM OLD."attendance_day_id"
		OR NEW."requested_by_account_id" IS DISTINCT FROM OLD."requested_by_account_id"
		OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
		OR NEW."reason" IS DISTINCT FROM OLD."reason"
		OR NEW."requested_start_at" IS DISTINCT FROM OLD."requested_start_at"
		OR NEW."requested_end_at" IS DISTINCT FROM OLD."requested_end_at" THEN
		RAISE EXCEPTION 'overtime request fields are immutable'
			USING ERRCODE = 'check_violation',
				TABLE = 'overtime_requests',
				CONSTRAINT = 'overtime_requests_immutable_ck';
	END IF;
	IF OLD."status" <> 'PENDING'
		AND (NEW."status", NEW."reviewed_by_account_id", NEW."reviewed_at", NEW."review_reason")
			IS DISTINCT FROM (OLD."status", OLD."reviewed_by_account_id", OLD."reviewed_at", OLD."review_reason") THEN
		RAISE EXCEPTION 'a decided overtime request cannot change'
			USING ERRCODE = 'check_violation',
				TABLE = 'overtime_requests',
				CONSTRAINT = 'overtime_requests_terminal_ck';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "overtime_requests_assert_unchanged"
	BEFORE UPDATE ON "overtime_requests"
	FOR EACH ROW
	EXECUTE FUNCTION "overtime_requests_assert_unchanged"();--> statement-breakpoint
CREATE TRIGGER "overtime_requests_set_updated_at"
	BEFORE UPDATE ON "overtime_requests"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();--> statement-breakpoint
-- Same rules for corrections (DATABASE §5.8). The before-snapshot (base_revision, before_*) is what HR reviews
-- against, so it is fixed with the requested values. applied_revision and the review fields are set once, on decision.
CREATE FUNCTION "attendance_adjustment_requests_assert_unchanged"() RETURNS trigger
	LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."id" IS DISTINCT FROM OLD."id"
		OR NEW."attendance_day_id" IS DISTINCT FROM OLD."attendance_day_id"
		OR NEW."requested_by_account_id" IS DISTINCT FROM OLD."requested_by_account_id"
		OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
		OR NEW."reason" IS DISTINCT FROM OLD."reason"
		OR NEW."base_revision" IS DISTINCT FROM OLD."base_revision"
		OR NEW."before_checkin_at" IS DISTINCT FROM OLD."before_checkin_at"
		OR NEW."before_checkout_at" IS DISTINCT FROM OLD."before_checkout_at"
		OR NEW."before_day_status_id" IS DISTINCT FROM OLD."before_day_status_id"
		OR NEW."requested_checkin_at" IS DISTINCT FROM OLD."requested_checkin_at"
		OR NEW."requested_checkout_at" IS DISTINCT FROM OLD."requested_checkout_at"
		OR NEW."requested_day_status_id" IS DISTINCT FROM OLD."requested_day_status_id" THEN
		RAISE EXCEPTION 'attendance correction request fields are immutable'
			USING ERRCODE = 'check_violation',
				TABLE = 'attendance_adjustment_requests',
				CONSTRAINT = 'attendance_adjustment_requests_immutable_ck';
	END IF;
	IF OLD."status" <> 'PENDING'
		AND (NEW."status", NEW."reviewed_by_account_id", NEW."reviewed_at", NEW."review_reason", NEW."applied_revision")
			IS DISTINCT FROM (OLD."status", OLD."reviewed_by_account_id", OLD."reviewed_at", OLD."review_reason", OLD."applied_revision") THEN
		RAISE EXCEPTION 'a decided attendance correction request cannot change'
			USING ERRCODE = 'check_violation',
				TABLE = 'attendance_adjustment_requests',
				CONSTRAINT = 'attendance_adjustment_requests_terminal_ck';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "attendance_adjustment_requests_assert_unchanged"
	BEFORE UPDATE ON "attendance_adjustment_requests"
	FOR EACH ROW
	EXECUTE FUNCTION "attendance_adjustment_requests_assert_unchanged"();--> statement-breakpoint
CREATE TRIGGER "attendance_adjustment_requests_set_updated_at"
	BEFORE UPDATE ON "attendance_adjustment_requests"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
