-- V20261015195441__add_users_is_staff
--
-- Staff accounts are hidden from every user-facing query and can only
-- impersonate. See shared/rbac/README.md.
--
-- Nullable with no default: DSQL rejects either on ADD COLUMN. NULL means "not
-- staff", so every filter is `is_staff IS NOT TRUE`, never `= false`.

ALTER TABLE users ADD COLUMN is_staff BOOLEAN;
