-- 20260823055243_add_analytics_rollups
--
-- Pre-aggregated analytics, maintained by row triggers so reads are never stale.
-- Additive: the code live at merge time neither reads nor knows about these.

CREATE TABLE expenditure_rollup (
    project_id        INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    month             DATE NOT NULL,
    category          VARCHAR(50),
    status            VARCHAR(15) NOT NULL,
    total_amount      NUMERIC NOT NULL DEFAULT 0,
    expenditure_count INT NOT NULL DEFAULT 0
);

-- An expression index, not UNIQUE NULLS NOT DISTINCT, which would need PG15.
-- The IS NULL flag keeps a category of '' out of NULL's bucket.
CREATE UNIQUE INDEX expenditure_rollup_grain
    ON expenditure_rollup (
        project_id, month, status, (category IS NULL), COALESCE(category, '')
    );

CREATE INDEX expenditure_rollup_status_month_idx
    ON expenditure_rollup (status, month);

-- Spend is deliberately absent: it lives only in expenditure_rollup.
CREATE TABLE project_rollup (
    project_id     INT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
    member_count   INT NOT NULL DEFAULT 0,
    total_donated  NUMERIC NOT NULL DEFAULT 0,
    donation_count INT NOT NULL DEFAULT 0,
    report_count   INT NOT NULL DEFAULT 0,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO expenditure_rollup
    (project_id, month, category, status, total_amount, expenditure_count)
SELECT project_id, date_trunc('month', spent_on)::date, category, status,
       SUM(amount), COUNT(*)
FROM expenditures
GROUP BY project_id, date_trunc('month', spent_on)::date, category, status;

INSERT INTO project_rollup
    (project_id, member_count, total_donated, donation_count, report_count)
SELECT p.project_id,
       COALESCE(m.c, 0),
       COALESCE(d.total, 0),
       COALESCE(d.c, 0),
       COALESCE(r.c, 0)
FROM projects p
LEFT JOIN (SELECT project_id, COUNT(*) AS c FROM project_memberships GROUP BY project_id) m
       ON m.project_id = p.project_id
LEFT JOIN (SELECT project_id, COUNT(*) AS c, SUM(amount) AS total FROM project_donations GROUP BY project_id) d
       ON d.project_id = p.project_id
LEFT JOIN (SELECT project_id, COUNT(*) AS c FROM reports GROUP BY project_id) r
       ON r.project_id = p.project_id;

-- Function bodies qualify table names: a trigger runs under the caller's
-- search_path, not this migration's.

CREATE FUNCTION branch.expenditure_rollup_add(
    p_project_id INT,
    p_spent_on   DATE,
    p_category   VARCHAR,
    p_status     VARCHAR,
    p_amount     NUMERIC
) RETURNS void LANGUAGE sql AS $$
    INSERT INTO branch.expenditure_rollup AS er
        (project_id, month, category, status, total_amount, expenditure_count)
    VALUES (p_project_id, date_trunc('month', p_spent_on)::date, p_category, p_status, p_amount, 1)
    ON CONFLICT (project_id, month, status, (category IS NULL), COALESCE(category, ''))
    DO UPDATE
        SET total_amount      = er.total_amount + EXCLUDED.total_amount,
            expenditure_count = er.expenditure_count + EXCLUDED.expenditure_count;
$$;

CREATE FUNCTION branch.expenditure_rollup_remove(
    p_project_id INT,
    p_spent_on   DATE,
    p_category   VARCHAR,
    p_status     VARCHAR,
    p_amount     NUMERIC
) RETURNS void LANGUAGE sql AS $$
    -- Never an upsert: a project cascade-delete reaches `expenditures` and this
    -- table in an undefined order, so a zero-row UPDATE is the correct no-op.
    -- Predicate matches expenditure_rollup_grain's expressions so it uses it.
    UPDATE branch.expenditure_rollup
       SET total_amount      = total_amount - p_amount,
           expenditure_count = expenditure_count - 1
     WHERE project_id = p_project_id
       AND month      = date_trunc('month', p_spent_on)::date
       AND status     = p_status
       AND (category IS NULL) = (p_category IS NULL)
       AND COALESCE(category, '') = COALESCE(p_category, '');
$$;

-- Always a plain UPDATE: the row exists for any live project via the backfill
-- above and projects_rollup_seed, and must not be recreated during a cascade.
CREATE FUNCTION branch.project_rollup_bump(
    p_project_id INT,
    p_members    INT,
    p_donated    NUMERIC,
    p_donations  INT,
    p_reports    INT
) RETURNS void LANGUAGE sql AS $$
    UPDATE branch.project_rollup
       SET member_count   = member_count + p_members,
           total_donated  = total_donated + p_donated,
           donation_count = donation_count + p_donations,
           report_count   = report_count + p_reports,
           updated_at     = CURRENT_TIMESTAMP
     WHERE project_id = p_project_id;
$$;

CREATE FUNCTION branch.expenditures_rollup_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM branch.expenditure_rollup_remove(
            OLD.project_id, OLD.spent_on, OLD.category, OLD.status, OLD.amount);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM branch.expenditure_rollup_add(
            NEW.project_id, NEW.spent_on, NEW.category, NEW.status, NEW.amount);
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION branch.donations_rollup_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM branch.project_rollup_bump(OLD.project_id, 0, -OLD.amount, -1, 0);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM branch.project_rollup_bump(NEW.project_id, 0, NEW.amount, 1, 0);
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION branch.memberships_rollup_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM branch.project_rollup_bump(OLD.project_id, -1, 0, 0, 0);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM branch.project_rollup_bump(NEW.project_id, 1, 0, 0, 0);
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION branch.reports_rollup_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM branch.project_rollup_bump(OLD.project_id, 0, 0, 0, -1);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM branch.project_rollup_bump(NEW.project_id, 0, 0, 0, 1);
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION branch.projects_rollup_seed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO branch.project_rollup (project_id) VALUES (NEW.project_id)
    ON CONFLICT (project_id) DO NOTHING;
    RETURN NULL;
END;
$$;

CREATE TRIGGER projects_rollup_seed
    AFTER INSERT ON projects
    FOR EACH ROW EXECUTE FUNCTION branch.projects_rollup_seed();

CREATE TRIGGER expenditures_rollup_sync
    AFTER INSERT OR UPDATE OR DELETE ON expenditures
    FOR EACH ROW EXECUTE FUNCTION branch.expenditures_rollup_sync();

CREATE TRIGGER donations_rollup_sync
    AFTER INSERT OR UPDATE OR DELETE ON project_donations
    FOR EACH ROW EXECUTE FUNCTION branch.donations_rollup_sync();

CREATE TRIGGER memberships_rollup_sync
    AFTER INSERT OR UPDATE OR DELETE ON project_memberships
    FOR EACH ROW EXECUTE FUNCTION branch.memberships_rollup_sync();

CREATE TRIGGER reports_rollup_sync
    AFTER INSERT OR UPDATE OR DELETE ON reports
    FOR EACH ROW EXECUTE FUNCTION branch.reports_rollup_sync();
