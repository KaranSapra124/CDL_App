-- Suspending a student blocks access but keeps all their data.
-- Student login and video access must check suspended_at is null (they do not exist yet).
alter table students
    add column suspended_at     timestamptz,
    add column suspended_reason text,
    add column suspended_by     bigint references admins (id) on delete set null,
    add constraint students_suspension_consistent
        check ((suspended_at is null) = (suspended_reason is null));
