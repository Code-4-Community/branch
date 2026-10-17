-- V20261016230432__add_users_deleted_at
--
-- Flyway runs this file inside a SINGLE transaction, with search_path =
-- branch, public -- so table names can be unqualified.
--
-- Aurora DSQL: exactly ONE DDL statement per file (DML goes in a file of its
-- own), CREATE INDEX ${async} ..., no SERIAL, triggers, PL/pgSQL or TRUNCATE,
-- and at most 3,000 rows changed. CI lints this file with dsql-lint.
--
-- This migration is applied to PRODUCTION automatically when the PR merges,
-- BEFORE the new lambda code is deployed. It must be safe for the code that is
-- live right now: additive changes only. See apps/backend/db/README.md for the
-- expand/contract rules that destructive changes need.
--
-- Forward-only: there is no rollback. Fix a mistake with a new migration, and
-- never edit a migration that has been merged -- Flyway checksums it, and
-- someone has already run it. Do not use IF NOT EXISTS: you want a failure, not
-- silent drift.


ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
