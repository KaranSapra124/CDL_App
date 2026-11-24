-- Messages inside a support ticket. Admin replies can carry a screenshot (pasted or uploaded).
create table ticket_messages (
    id              bigserial   primary key,
    ticket_id       bigint      not null references support_tickets (id) on delete cascade,
    author_type     text        not null check (author_type in ('admin', 'student')),
    author_admin_id bigint      references admins (id) on delete set null,
    body            text        not null default '',
    attachment_path text,
    attachment_type text,
    created_at      timestamptz not null default now(),
    check (author_type <> 'admin' or author_admin_id is not null),
    check (length(body) > 0 or attachment_path is not null)
);
create index ticket_messages_ticket_idx on ticket_messages (ticket_id, created_at);

-- Outgoing emails. A background worker sends rows with status 'queued' over SMTP.
create table notifications (
    id         bigserial   primary key,
    audience   text        not null check (audience in ('all', 'paid', 'unpaid', 'student', 'system')),
    student_id bigint      references students (id) on delete cascade,
    recipient  text        not null,
    subject    text        not null,
    body       text        not null,
    status     text        not null default 'queued' check (status in ('queued', 'sent', 'failed')),
    error      text,
    created_by bigint      references admins (id) on delete set null,
    created_at timestamptz not null default now(),
    sent_at    timestamptz
);
create index notifications_queued_idx on notifications (created_at) where status = 'queued';
