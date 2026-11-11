-- Courses. Prices are stored in paise (integer) so money never suffers floating-point rounding.
-- GST is not stored here; it is applied at checkout.
create table courses (
    id          bigserial   primary key,
    slug        text        not null unique,
    title       text        not null,
    description text        not null default '',
    price_paise integer     not null check (price_paise >= 0),
    status      text        not null default 'draft'
                            check (status in ('draft', 'active', 'archived')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Video modules inside a course. Deleting a course deletes its modules.
create table modules (
    id               bigserial   primary key,
    course_id        bigint      not null references courses (id) on delete cascade,
    module_number    integer     not null check (module_number > 0),
    title            text        not null,
    description      text        not null default '',
    duration_seconds integer     check (duration_seconds is null or duration_seconds >= 0),
    is_free_preview  boolean     not null default false,
    is_new           boolean     not null default false,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (course_id, module_number)
);
