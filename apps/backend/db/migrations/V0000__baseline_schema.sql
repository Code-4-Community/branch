-- 0000_baseline_schema
--
-- Squash up to 20260907213524; RDS never ran it (baselined there), it only builds new databases.
-- Runs outside a transaction (see the .conf): DSQL allows one DDL per transaction.
-- Rollup functions must follow the indexes: expenditure_rollup_add's ON CONFLICT needs its arbiter index valid.

CREATE SEQUENCE users_user_id_seq CACHE 1;
CREATE TABLE users (
    user_id INT PRIMARY KEY DEFAULT nextval('users_user_id_seq'),
    cognito_sub VARCHAR(255) UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profile_image TEXT
);

CREATE SEQUENCE projects_project_id_seq CACHE 1;
CREATE TABLE projects (
    project_id INT PRIMARY KEY DEFAULT nextval('projects_project_id_seq'),
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    total_budget NUMERIC(12,2),
    start_date DATE,
    end_date DATE,
    currency VARCHAR(10) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE project_memberships_membership_id_seq CACHE 1;
CREATE TABLE project_memberships (
    membership_id INT PRIMARY KEY DEFAULT nextval('project_memberships_membership_id_seq'),
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    role VARCHAR(30) NOT NULL CHECK (role IN ('Director', 'Student')),
    start_date DATE,
    hours NUMERIC(6,2),
    UNIQUE (project_id, user_id)
);

CREATE SEQUENCE donors_donor_id_seq CACHE 1;
CREATE TABLE donors (
    donor_id INT PRIMARY KEY DEFAULT nextval('donors_donor_id_seq'),
    organization VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100),
    contact_email VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE project_donations_donation_id_seq CACHE 1;
CREATE TABLE project_donations (
    donation_id INT PRIMARY KEY DEFAULT nextval('project_donations_donation_id_seq'),
    donor_id INT NOT NULL REFERENCES donors(donor_id) ON DELETE RESTRICT,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    donated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (donor_id, project_id)
);

CREATE SEQUENCE expenditures_expenditure_id_seq CACHE 1;
CREATE TABLE expenditures (
    expenditure_id INT PRIMARY KEY DEFAULT nextval('expenditures_expenditure_id_seq'),
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    entered_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    category VARCHAR(50),
    description TEXT,
    status VARCHAR(15) NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'denied', 'needs_more_info')),
    receipt_url TEXT,
    spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    admin_notes TEXT
);

CREATE SEQUENCE reports_report_id_seq CACHE 1;
CREATE TABLE reports (
    report_id INT PRIMARY KEY DEFAULT nextval('reports_report_id_seq'),
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    object_url TEXT NOT NULL,
    report_type TEXT NOT NULL DEFAULT 'technical' CHECK (report_type IN ('technical', 'narrative')),
    date_created DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE expenditure_rollup (
    project_id        INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    month             DATE NOT NULL,
    category          VARCHAR(50),
    status            VARCHAR(15) NOT NULL,
    total_amount      NUMERIC NOT NULL DEFAULT 0,
    expenditure_count INT NOT NULL DEFAULT 0
);

CREATE TABLE project_rollup (
    project_id     INT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
    member_count   INT NOT NULL DEFAULT 0,
    total_donated  NUMERIC NOT NULL DEFAULT 0,
    donation_count INT NOT NULL DEFAULT 0,
    report_count   INT NOT NULL DEFAULT 0,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ${async} expenditures_project_id_spent_on_idx ON expenditures (project_id, spent_on);
CREATE INDEX ${async} expenditures_spent_on_idx ON expenditures (spent_on);
CREATE INDEX ${async} expenditures_entered_by_idx ON expenditures (entered_by);
CREATE INDEX ${async} expenditures_status_spent_on_idx ON expenditures (status, spent_on);
CREATE INDEX ${async} reports_project_id_date_created_idx ON reports (project_id, date_created);
CREATE INDEX ${async} reports_date_created_idx ON reports (date_created);
CREATE INDEX ${async} project_memberships_user_id_idx ON project_memberships (user_id);
CREATE INDEX ${async} project_donations_project_id_donation_id_idx ON project_donations (project_id, donation_id);
CREATE INDEX ${async} users_name_idx ON users (name);

-- (category IS NULL) keeps a NULL category distinct from ''.
CREATE UNIQUE INDEX ${async} expenditure_rollup_grain
    ON expenditure_rollup (
        project_id, month, status, (category IS NULL), COALESCE(category, '')
    );
CREATE INDEX ${async} expenditure_rollup_status_month_idx
    ON expenditure_rollup (status, month);

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
    UPDATE branch.expenditure_rollup
       SET total_amount      = total_amount - p_amount,
           expenditure_count = expenditure_count - 1
     WHERE project_id = p_project_id
       AND month      = date_trunc('month', p_spent_on)::date
       AND status     = p_status
       AND (category IS NULL) = (p_category IS NULL)
       AND COALESCE(category, '') = COALESCE(p_category, '');
$$;

-- Returns 1/NULL, not void: a bump matching no row must fail rather than drift.
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
