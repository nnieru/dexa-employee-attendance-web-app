-- System role codes that authorization depends on. Replaying this seed is safe: a role that already
-- exists keeps its current name and activation state.
INSERT INTO "master_roles" ("code", "name") VALUES
	('EMPLOYEE', 'Employee'),
	('HR', 'HR')
ON CONFLICT ("code") DO NOTHING;
