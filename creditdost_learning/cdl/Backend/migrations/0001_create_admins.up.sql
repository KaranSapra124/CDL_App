-- Admin accounts for the web admin panel. Student tables come in a later phase.
create table admins (
    id            bigserial   primary key,
    email         text        not null,
    password_hash text        not null,
    name          text        not null default '',
    role          text        not null default 'admin'
                              check (role in ('super_admin', 'admin')),
    is_active     boolean     not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- Emails are unique regardless of letter case: Admin@x.com and admin@x.com are the same account.
create unique index admins_email_key on admins (lower(email));
