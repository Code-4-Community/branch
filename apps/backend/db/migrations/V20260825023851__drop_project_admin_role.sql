-- 20260825023851_drop_project_admin_role
--
-- Contract phase for 20260812011405, which left the CHECK accepting the old
-- names. Admin is a user-level flag (users.is_admin), never a membership role:
-- a project 'Admin' row only ever meant "director of this project", because
-- DIRECTOR_ROLES held both and is_admin is never read from a membership.
-- Rewriting those rows to 'Director' therefore changes nobody's permissions.

UPDATE project_memberships SET role = 'Director' WHERE role = 'Admin';

ALTER TABLE project_memberships
    DROP CONSTRAINT IF EXISTS project_memberships_role_check;

ALTER TABLE project_memberships
    ADD CONSTRAINT project_memberships_role_check
    CHECK (role IN ('Director', 'Student'));
