-- Student sessions (devices). The PRD allows 2 active devices per student; the login flow will enforce it later.
create table sessions (
    id           bigserial   primary key,
    student_id   bigint      not null references students (id) on delete cascade,
    device_label text        not null default '',
    ip_address   text        not null default '',
    created_at   timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    revoked_at   timestamptz
);
create index sessions_active_idx on sessions (student_id) where revoked_at is null;

-- Per-student progress on each module (watch time and completion).
create table module_progress (
    student_id      bigint      not null references students (id) on delete cascade,
    module_id       bigint      not null references modules (id) on delete cascade,
    watched_seconds integer     not null default 0 check (watched_seconds >= 0),
    completed       boolean     not null default false,
    updated_at      timestamptz not null default now(),
    primary key (student_id, module_id)
);

-- Manual (offline) payments record how the money was received and the reference to match it.
alter table orders
    add column manual_method    text,
    add column manual_reference text;
alter table orders
    add constraint orders_manual_needs_reference
    check (gateway <> 'manual' or manual_reference is not null);
