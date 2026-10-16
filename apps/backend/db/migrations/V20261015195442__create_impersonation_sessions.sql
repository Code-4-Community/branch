-- No foreign keys: the audit trail must outlive the users it names.

CREATE TABLE impersonation_sessions (
    session_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_user_id  INT NOT NULL,
    target_user_id INT NOT NULL,
    mode           VARCHAR(10) NOT NULL CHECK (mode IN ('read_only', 'full')),
    started_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at     TIMESTAMP NOT NULL,
    ended_at       TIMESTAMP
);
