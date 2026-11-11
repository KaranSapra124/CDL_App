-- Students (learners who register on the portal).
create table students (
    id                 bigserial   primary key,
    name               text        not null,
    email              text,
    mobile             text,
    city               text        not null default '',
    state              text        not null default '',
    preferred_language text        not null default 'hi',
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    constraint students_contact_required check (email is not null or mobile is not null)
);
create unique index students_email_key  on students (lower(email)) where email is not null;
create unique index students_mobile_key on students (mobile)       where mobile is not null;

-- A student's access to a course. Created by a paid order or by manual enrolment.
create table enrollments (
    id         bigserial   primary key,
    student_id bigint      not null references students (id) on delete cascade,
    course_id  bigint      not null references courses (id) on delete restrict,
    source     text        not null check (source in ('online', 'manual')),
    created_at timestamptz not null default now(),
    unique (student_id, course_id)
);
create index enrollments_created_at_idx on enrollments (created_at);

-- Checkout orders. Amounts in paise. The order's display code is "CD-<id>".
create table orders (
    id                 bigserial   primary key,
    student_id         bigint      not null references students (id) on delete restrict,
    course_id          bigint      not null references courses (id) on delete restrict,
    base_paise         integer     not null check (base_paise >= 0),
    discount_paise     integer     not null default 0 check (discount_paise >= 0),
    gst_paise          integer     not null default 0 check (gst_paise >= 0),
    total_paise        integer     not null check (total_paise >= 0),
    status             text        not null default 'pending'
                                   check (status in ('pending', 'paid', 'failed', 'refunded')),
    gateway            text        not null default 'razorpay' check (gateway in ('razorpay', 'manual')),
    gateway_payment_id text,
    created_at         timestamptz not null default now(),
    paid_at            timestamptz
);
create index orders_created_at_idx on orders (created_at desc);
create index orders_status_idx     on orders (status);
create index orders_paid_at_idx    on orders (paid_at);

-- Completion certificates, one per student per course.
create table certificates (
    id               bigserial   primary key,
    certificate_code text        not null unique,
    student_id       bigint      not null references students (id) on delete cascade,
    course_id        bigint      not null references courses (id) on delete restrict,
    issued_at        timestamptz not null default now(),
    unique (student_id, course_id)
);

-- Support tickets raised by students.
create table support_tickets (
    id                 bigserial   primary key,
    student_id         bigint      not null references students (id) on delete cascade,
    category           text        not null,
    subject            text        not null,
    status             text        not null default 'open'
                                   check (status in ('open', 'in_progress', 'resolved')),
    priority           text        not null default 'normal' check (priority in ('normal', 'urgent')),
    assigned_admin_id  bigint      references admins (id) on delete set null,
    created_at         timestamptz not null default now(),
    first_response_at  timestamptz,
    resolved_at        timestamptz
);
create index support_tickets_status_idx on support_tickets (status);

-- 1 to 5 star ratings per module, one per student per module.
create table module_ratings (
    id         bigserial   primary key,
    module_id  bigint      not null references modules (id) on delete cascade,
    student_id bigint      not null references students (id) on delete cascade,
    stars      smallint    not null check (stars between 1 and 5),
    comment    text        not null default '',
    created_at timestamptz not null default now(),
    unique (module_id, student_id)
);

-- AI dubbing status per module per language.
create table module_audio_tracks (
    module_id  bigint      not null references modules (id) on delete cascade,
    language   text        not null,
    status     text        not null default 'not_started'
                           check (status in ('not_started', 'processing', 'live')),
    updated_at timestamptz not null default now(),
    primary key (module_id, language)
);

-- Feed shown as "Live System Events" on the dashboard.
create table activity_events (
    id         bigserial   primary key,
    kind       text        not null,
    message    text        not null,
    created_at timestamptz not null default now()
);
create index activity_events_created_at_idx on activity_events (created_at desc);
