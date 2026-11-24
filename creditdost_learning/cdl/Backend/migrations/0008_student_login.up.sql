-- Student login. A student may have no password yet (manually enrolled students claim their
-- account by setting one with their email address).
alter table students
    add column password_hash   text,
    add column password_set_at timestamptz;
