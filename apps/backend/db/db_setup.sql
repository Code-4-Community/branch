DROP SCHEMA IF EXISTS branch CASCADE;
CREATE SCHEMA branch;
SET search_path TO branch;

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    cognito_sub VARCHAR(255) UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profile_image TEXT
);

CREATE TABLE projects (
    project_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    total_budget NUMERIC(12,2),
    start_date DATE,
    end_date DATE,
    currency VARCHAR(10) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_memberships (
    membership_id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL CHECK (role IN ('PI', 'Accountant', 'Staff', 'Admin')),
    start_date DATE,
    hours NUMERIC(6,2),
    UNIQUE (project_id, user_id)
);

CREATE TABLE donors (
    donor_id SERIAL PRIMARY KEY,
    organization VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100),
    contact_email VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_donations (
    donation_id SERIAL PRIMARY KEY,
    donor_id INT NOT NULL REFERENCES donors(donor_id) ON DELETE CASCADE,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    donated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (donor_id, project_id)
);

CREATE TABLE expenditures (
    expenditure_id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    entered_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    category VARCHAR(50),
    description TEXT,
    status VARCHAR(15) NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'denied', 'needs_more_info')),
    receipt_url TEXT,
    spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reports (
    report_id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    object_url TEXT NOT NULL,
    report_type TEXT NOT NULL DEFAULT 'technical' CHECK (report_type IN ('technical', 'narrative')),
    date_created DATE NOT NULL DEFAULT CURRENT_DATE
);

-- These seeded admins intentionally have cognito_sub = NULL. A NULL cognito_sub
-- means "pending invitation": POST /auth/register signs the email up in Cognito
-- and CLAIMS this row (setting cognito_sub) rather than returning 409, which
-- preserves user_id and is_admin. The same mechanism backs admin-created users
-- (POST /users), which also insert without a cognito_sub.
--
-- Registration is invitation-only: /auth/register cannot create a row, only
-- claim one, so an email with no row here (or created by an admin) gets 403.
--
-- To sign in as one of these locally you must control the mailbox to receive the
-- Cognito verification code. Otherwise register your own email and run
-- `make grant-admin EMAIL=you@example.com`.
INSERT INTO users (name, email, is_admin) VALUES
('Ashley Duggan', 'ashley@branch.org', TRUE),
('Renee Reddy', 'renee@branch.org', TRUE),
('Nour Shoreibah', 'nour@branch.org', TRUE);

INSERT INTO projects (name, description, total_budget, start_date, end_date, currency) VALUES
('Clinician Communication Study', 'Study of clinician-patient communication patterns', 500000, '2025-01-01', '2026-01-01', 'USD'),
('Health Education Initiative', 'Community health education and outreach', 300000, '2025-03-01', '2026-03-01', 'USD'),
('Policy Advocacy Program', 'Advocacy and policy change efforts', 200000, '2025-06-01', '2026-06-01', 'USD'),
('Proj B', '', 2500.50, NULL, NULL, 'USD');

INSERT INTO donors (organization, contact_name, contact_email) VALUES
('NIH', 'Dr. Sarah Lee', 'sarah@nih.gov'),
('Harvard Medical', 'John Smith', 'john@harvard.edu'),
('Wellcome Trust', 'Anna Johnson', 'anna@wellcome.org');

INSERT INTO project_donations (donor_id, project_id, amount, donated_at) VALUES
(1, 1, 150000, '2025-01-10'),
(2, 2, 120000, '2025-03-15'),
(3, 3, 90000, '2025-06-20');

INSERT INTO project_memberships (project_id, user_id, role, start_date, hours) VALUES
(1, 1, 'PI', '2025-01-01', 100.00),
(1, 2, 'Accountant', '2025-02-01', 80.00),
(2, 3, 'Staff', '2025-03-15', 60.00);

INSERT INTO expenditures (project_id, entered_by, amount, category, description, spent_on) VALUES
(1, 1, 5000, 'Travel', 'Domestic conference attendance', '2025-02-10'),
(1, 1, 4200, 'Travel Foreign', 'International collaborator meeting in London', '2025-03-22'),
(2, 2, 3000, 'General', 'Recording device supplies', '2025-04-05'),
(2, 2, 1500, 'Visitor / Honorarium', 'Guest lecturer honorarium', '2025-05-18'),
(3, 3, 2500, 'General', 'Educational materials', '2025-07-12'),
(3, 3, 1800, 'Travel', 'Local outreach travel', '2025-08-03');

INSERT INTO reports (project_id, title, object_url) VALUES
(1, 'Clinician Communication Study Report', 'https://s3.amazonaws.com/branch-reports/clinician_communication_study_report.pdf'),
(2, 'Health Education Initiative Report', 'https://s3.amazonaws.com/branch-reports/health_education_initiative_report.pdf'),
(3, 'Policy Advocacy Program Report', 'https://s3.amazonaws.com/branch-reports/policy_advocacy_program_report.pdf'),
(2, 'Research Program Reports', 'https://s3.amazonaws.com/branch-reports/research_program_reports.pdf'),
(3, 'Health Care Data Reports', 'https://s3.amazonaws.com/branch-reports/health_care_data_reports.pdf');
