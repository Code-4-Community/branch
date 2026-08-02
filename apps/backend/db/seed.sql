-- Seed data for local development and tests. NEVER applied to production.
--
-- Ids are load-bearing: tests assume users 1-3, projects 1-4 and donors 1-3
-- exist, and that any row they create lands on 4+. resetData() in db/testkit.ts
-- TRUNCATEs with RESTART IDENTITY before running this file, so every sequence
-- starts at 1. Do not reorder or remove rows without checking the tests.
--
-- Fully schema-qualified so it never depends on search_path.

-- These seeded admins intentionally have cognito_sub = NULL. A NULL cognito_sub
-- means "pending invitation": POST /auth/register signs the email up in Cognito
-- and CLAIMS this row (setting cognito_sub) rather than returning 409, which
-- preserves user_id and is_admin. The same mechanism backs admin-created users
-- (POST /users), which also insert without a cognito_sub.
--
-- To sign in as one of these locally you must control the mailbox to receive the
-- Cognito verification code. Otherwise register your own email and run
-- `make grant-admin EMAIL=you@example.com`.
INSERT INTO branch.users (name, email, is_admin) VALUES
('Ashley Duggan', 'ashley@branch.org', TRUE),
('Renee Reddy', 'renee@branch.org', TRUE),
('Nour Shoreibah', 'nour@branch.org', TRUE);

INSERT INTO branch.projects (name, description, total_budget, start_date, end_date, currency) VALUES
('Clinician Communication Study', 'Study of clinician-patient communication patterns', 500000, '2025-01-01', '2026-01-01', 'USD'),
('Health Education Initiative', 'Community health education and outreach', 300000, '2025-03-01', '2026-03-01', 'USD'),
('Policy Advocacy Program', 'Advocacy and policy change efforts', 200000, '2025-06-01', '2026-06-01', 'USD'),
('Proj B', '', 2500.50, NULL, NULL, 'USD');

INSERT INTO branch.donors (organization, contact_name, contact_email) VALUES
('NIH', 'Dr. Sarah Lee', 'sarah@nih.gov'),
('Harvard Medical', 'John Smith', 'john@harvard.edu'),
('Wellcome Trust', 'Anna Johnson', 'anna@wellcome.org');

INSERT INTO branch.project_donations (donor_id, project_id, amount, donated_at) VALUES
(1, 1, 150000, '2025-01-10'),
(2, 2, 120000, '2025-03-15'),
(3, 3, 90000, '2025-06-20');

INSERT INTO branch.project_memberships (project_id, user_id, role, start_date, hours) VALUES
(1, 1, 'PI', '2025-01-01', 100.00),
(1, 2, 'Accountant', '2025-02-01', 80.00),
(2, 3, 'Staff', '2025-03-15', 60.00);

INSERT INTO branch.expenditures (project_id, entered_by, amount, category, description, spent_on) VALUES
(1, 1, 5000, 'Travel', 'Domestic conference attendance', '2025-02-10'),
(1, 1, 4200, 'Travel Foreign', 'International collaborator meeting in London', '2025-03-22'),
(2, 2, 3000, 'General', 'Recording device supplies', '2025-04-05'),
(2, 2, 1500, 'Visitor / Honorarium', 'Guest lecturer honorarium', '2025-05-18'),
(3, 3, 2500, 'General', 'Educational materials', '2025-07-12'),
(3, 3, 1800, 'Travel', 'Local outreach travel', '2025-08-03');

INSERT INTO branch.reports (project_id, title, object_url) VALUES
(1, 'Clinician Communication Study Report', 'https://s3.amazonaws.com/branch-reports/clinician_communication_study_report.pdf'),
(2, 'Health Education Initiative Report', 'https://s3.amazonaws.com/branch-reports/health_education_initiative_report.pdf'),
(3, 'Policy Advocacy Program Report', 'https://s3.amazonaws.com/branch-reports/policy_advocacy_program_report.pdf'),
(2, 'Research Program Reports', 'https://s3.amazonaws.com/branch-reports/research_program_reports.pdf'),
(3, 'Health Care Data Reports', 'https://s3.amazonaws.com/branch-reports/health_care_data_reports.pdf');
