-- Company schedule versions must not overlap (DATABASE §5.2). The range is half-open, and a null effective_until
-- means open-ended. No extension is needed: GiST indexes range types natively and no equality column participates.
-- Violations raise exclusion_violation (23P01), which the service maps to a conflict.
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_effective_range_ex" EXCLUDE USING gist (daterange("effective_from", "effective_until", '[)') WITH &&);--> statement-breakpoint
-- Working weekdays are ISO numbers 1-7, each listed once (DATABASE §5.2). A CHECK cannot contain a subquery, so the
-- distinct count lives in this immutable function. A NULL element fails the cardinality comparison.
CREATE FUNCTION "work_schedules_working_weekdays_valid"(weekdays smallint[]) RETURNS boolean
	LANGUAGE sql
	IMMUTABLE
AS $$
	SELECT NOT EXISTS (SELECT 1 FROM unnest(weekdays) AS weekday WHERE weekday NOT BETWEEN 1 AND 7)
		AND (SELECT count(DISTINCT weekday) FROM unnest(weekdays) AS weekday) = cardinality(weekdays);
$$;--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_working_weekdays_ck" CHECK ("work_schedules_working_weekdays_valid"("working_weekdays"));
