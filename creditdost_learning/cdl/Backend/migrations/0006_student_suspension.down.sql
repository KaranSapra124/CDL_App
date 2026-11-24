alter table students drop constraint if exists students_suspension_consistent;
alter table students
    drop column if exists suspended_by,
    drop column if exists suspended_reason,
    drop column if exists suspended_at;
