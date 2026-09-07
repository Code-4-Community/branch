-- 20260906215733_move_rollups_to_application
--
-- Aurora DSQL supports neither triggers nor PL/pgSQL, so rollup maintenance moves
-- into @branch/store. The three LANGUAGE sql helpers stay -- DSQL supports those,
-- and they hold the arithmetic; only the INSERT/UPDATE/DELETE dispatch moves.
--
-- The two FKs that flip to RESTRICT are the ones whose cascade used to fire a row
-- trigger from a lambda that never names the rollup tables (DELETE /donors/{id},
-- DELETE /users/{id}). RESTRICT turns a forgotten cascade into a loud FK error
-- instead of a silently wrong total. @branch/store deletes the children first.

DROP TRIGGER IF EXISTS expenditures_rollup_sync ON expenditures;
DROP TRIGGER IF EXISTS donations_rollup_sync ON project_donations;
DROP TRIGGER IF EXISTS memberships_rollup_sync ON project_memberships;
DROP TRIGGER IF EXISTS reports_rollup_sync ON reports;
DROP TRIGGER IF EXISTS projects_rollup_seed ON projects;

DROP TRIGGER IF EXISTS expenditures_rollup_truncate ON expenditures;
DROP TRIGGER IF EXISTS donations_rollup_truncate ON project_donations;
DROP TRIGGER IF EXISTS memberships_rollup_truncate ON project_memberships;
DROP TRIGGER IF EXISTS reports_rollup_truncate ON reports;

DROP FUNCTION branch.expenditures_rollup_sync();
DROP FUNCTION branch.donations_rollup_sync();
DROP FUNCTION branch.memberships_rollup_sync();
DROP FUNCTION branch.reports_rollup_sync();
DROP FUNCTION branch.projects_rollup_seed();
DROP FUNCTION branch.expenditures_rollup_truncate();
DROP FUNCTION branch.donations_rollup_truncate();
DROP FUNCTION branch.memberships_rollup_truncate();
DROP FUNCTION branch.reports_rollup_truncate();

-- NOT VALID because DSQL requires it on ALTER TABLE ADD CONSTRAINT, and it is
-- accurate either way: the constraint being replaced referenced the same rows,
-- so existing data cannot violate the new one. Only the delete action changes.
ALTER TABLE project_donations
    DROP CONSTRAINT project_donations_donor_id_fkey;
ALTER TABLE project_donations
    ADD CONSTRAINT project_donations_donor_id_fkey
    FOREIGN KEY (donor_id) REFERENCES donors(donor_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE project_memberships
    DROP CONSTRAINT project_memberships_user_id_fkey;
ALTER TABLE project_memberships
    ADD CONSTRAINT project_memberships_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT NOT VALID;
