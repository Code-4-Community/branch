-- 0000_baseline_schema
--
-- The schema as it existed before migrations were introduced, transcribed from
-- the old apps/backend/db/db_setup.sql. Table bodies are copied verbatim, since
-- this file has to match a production database that was built by hand.
--
-- A `0` prefix so it sorts before every future YYYYMMDDHHMMSS-prefixed migration
-- by construction.
--
-- This is the ONLY migration allowed to use IF NOT EXISTS. It has to be, because
-- production already has these tables and this migration is how that database
-- gets adopted into the ledger. In a normal migration IF NOT EXISTS hides drift
-- instead of failing, so don't copy this pattern.
--
-- Note IF NOT EXISTS skips the ENTIRE CREATE TABLE when the table exists, so it
-- cannot detect a column or constraint that differs. Adoption is therefore gated
-- on a pg_dump diff against production -- see apps/backend/db/README.md.

CREATE SCHEMA IF NOT EXISTS branch;

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    cognito_sub VARCHAR(255) UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profile_image TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    project_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    total_budget NUMERIC(12,2),
    start_date DATE,
    end_date DATE,
    currency VARCHAR(10) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_memberships (
    membership_id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL CHECK (role IN ('PI', 'Accountant', 'Staff', 'Admin')),
    start_date DATE,
    hours NUMERIC(6,2),
    UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS donors (
    donor_id SERIAL PRIMARY KEY,
    organization VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100),
    contact_email VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_donations (
    donation_id SERIAL PRIMARY KEY,
    donor_id INT NOT NULL REFERENCES donors(donor_id) ON DELETE CASCADE,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    donated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (donor_id, project_id)
);

CREATE TABLE IF NOT EXISTS expenditures (
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

CREATE TABLE IF NOT EXISTS reports (
    report_id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    object_url TEXT NOT NULL,
    report_type TEXT NOT NULL DEFAULT 'technical' CHECK (report_type IN ('technical', 'narrative')),
    date_created DATE NOT NULL DEFAULT CURRENT_DATE
);
