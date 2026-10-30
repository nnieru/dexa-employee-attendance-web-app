-- System-used status codes (DATABASE §5.1). Classification and day creation rely on these exact codes, so they
-- exist before any day or punch can be written. Labels are English (D-20).
INSERT INTO "master_attendance_statuses" ("code", "name", "category") VALUES
	('PENDING', 'Pending', 'DAY'),
	('PRESENT', 'Present', 'DAY'),
	('NOT_ATTEND', 'Not attended', 'DAY'),
	('SICK_LEAVE', 'Sick leave', 'DAY'),
	('LEAVE', 'Leave', 'DAY'),
	('DAY_OFF', 'Day off', 'DAY'),
	('PENDING_CHECKIN', 'Pending check-in', 'CHECK_IN'),
	('EARLY_CHECKIN', 'Early check-in', 'CHECK_IN'),
	('ON_TIME_CHECKIN', 'On-time check-in', 'CHECK_IN'),
	('LATE_CHECKIN', 'Late check-in', 'CHECK_IN'),
	('MISSING_CHECKIN', 'Missing check-in', 'CHECK_IN'),
	('CHECKIN_NOT_REQUIRED', 'Check-in not required', 'CHECK_IN'),
	('PENDING_CHECKOUT', 'Pending check-out', 'CHECK_OUT'),
	('EARLY_CHECKOUT', 'Early check-out', 'CHECK_OUT'),
	('ON_TIME_CHECKOUT', 'On-time check-out', 'CHECK_OUT'),
	('LATE_CHECKOUT', 'Late check-out', 'CHECK_OUT'),
	('MISSING_CHECKOUT', 'Missing check-out', 'CHECK_OUT'),
	('CHECKOUT_NOT_REQUIRED', 'Check-out not required', 'CHECK_OUT');
