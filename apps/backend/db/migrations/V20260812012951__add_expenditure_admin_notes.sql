-- add_expenditure_admin_notes
--
-- Every pending migration runs inside a SINGLE transaction, with
-- search_path = branch, public -- so table names can be unqualified, and
-- CREATE INDEX CONCURRENTLY / VACUUM will not work here.
--
-- This migration is applied to PRODUCTION automatically when the PR merges,
-- BEFORE the new lambda code is deployed. It must be safe for the code that is
-- live right now: additive changes only. See apps/backend/db/README.md for the
-- expand/contract rules that destructive changes need.
--
-- Forward-only: there is no rollback. Fix a mistake with a new migration, and
-- never edit a migration that has been merged -- someone has already run it.
-- Do not use IF NOT EXISTS: you want a failure, not silent drift.

ALTER TABLE expenditures ADD COLUMN admin_notes TEXT;
