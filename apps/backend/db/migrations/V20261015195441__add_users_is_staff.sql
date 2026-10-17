-- Nullable, no default: DSQL rejects both on ADD COLUMN, so filter with `is_staff IS NOT TRUE`.

ALTER TABLE users ADD COLUMN is_staff BOOLEAN;
