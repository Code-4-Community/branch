-- 20260907213524_project_rollup_bump_reports_hit
--
-- project_rollup_bump was a bare UPDATE returning void, so a project with no
-- project_rollup row swallowed every donation, membership and report change
-- with no error. The projects_rollup_seed trigger used to guarantee that row
-- for any insert path; since 20260906215733 only @branch/store seeds it, so a
-- project arriving another way would drift silently and permanently.
--
-- Returns 1 when a row was updated and NULL when none matched, which is what a
-- LANGUAGE sql function yields from an UPDATE ... RETURNING that hits nothing.
-- The caller treats NULL as an error.

DROP FUNCTION branch.project_rollup_bump(INT, INT, NUMERIC, INT, INT);

CREATE FUNCTION branch.project_rollup_bump(
    p_project_id INT,
    p_members    INT,
    p_donated    NUMERIC,
    p_donations  INT,
    p_reports    INT
) RETURNS integer LANGUAGE sql AS $$
    UPDATE branch.project_rollup
       SET member_count   = member_count + p_members,
           total_donated  = total_donated + p_donated,
           donation_count = donation_count + p_donations,
           report_count   = report_count + p_reports,
           updated_at     = CURRENT_TIMESTAMP
     WHERE project_id = p_project_id
    RETURNING 1;
$$;
