-- V20261015195443__create_impersonation_actions
--
-- Every mutating request made while impersonating in full mode.

CREATE TABLE impersonation_actions (
    action_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL,
    method      VARCHAR(10) NOT NULL,
    path        TEXT NOT NULL,
    status_code INT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
