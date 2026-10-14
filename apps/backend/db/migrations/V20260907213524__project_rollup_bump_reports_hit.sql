-- 20260907213524_project_rollup_bump_reports_hit
--
-- Returns 1/NULL, not void: only the store seeds project_rollup now, so a bump
-- matching no row must fail rather than drift.

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
