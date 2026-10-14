-- PI + Accountant -> Director, Staff -> Student, Admin unchanged.
-- Expand phase: the CHECK still accepts the old names so the deployed code can
-- keep writing them until it is replaced. A later migration drops them.

ALTER TABLE project_memberships
    DROP CONSTRAINT IF EXISTS project_memberships_role_check;

ALTER TABLE project_memberships
    ADD CONSTRAINT project_memberships_role_check
    CHECK (role IN ('Admin', 'Director', 'Student', 'PI', 'Accountant', 'Staff'));

UPDATE project_memberships SET role = 'Director' WHERE role IN ('PI', 'Accountant');
UPDATE project_memberships SET role = 'Student' WHERE role = 'Staff';
