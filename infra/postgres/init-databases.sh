#!/bin/sh
# Creates one database and one login role per service. Services never share a role or database.
set -eu

create_database() {
  role="$1"; database="$2"; password="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE "$role" LOGIN PASSWORD '$password';
CREATE DATABASE "$database" OWNER "$role";
REVOKE ALL ON DATABASE "$database" FROM PUBLIC;
SQL
}

create_database auth_app auth_db "$AUTH_DB_PASSWORD"
create_database employee_app employee_db "$EMPLOYEE_DB_PASSWORD"
create_database attendance_app attendance_db "$ATTENDANCE_DB_PASSWORD"
create_database notification_app notification_db "$NOTIFICATION_DB_PASSWORD"
create_database audit_app audit_db "$AUDIT_DB_PASSWORD"
