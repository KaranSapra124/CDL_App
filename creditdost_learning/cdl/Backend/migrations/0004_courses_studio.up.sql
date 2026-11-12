-- Course studio: two levels only. A course has modules, and each module is one video.

create table categories (
    id         bigserial   primary key,
    name       text        not null,
    slug       text        not null unique,
    created_at timestamptz not null default now()
);
create unique index categories_name_key on categories (lower(name));

create table instructors (
    id         bigserial   primary key,
    name       text        not null,
    title      text        not null default '',
    created_at timestamptz not null default now()
);

alter table courses
    add column thumbnail_path      text,
    add column mrp_paise           integer     check (mrp_paise is null or mrp_paise >= 0),
    add column certificate_enabled boolean     not null default true,
    add column visibility          text        not null default 'public'
                                               check (visibility in ('public', 'private_link', 'invite_only')),
    add column primary_language    text        not null default 'hi',
    add column category_id         bigint      references categories (id) on delete set null;

create table course_instructors (
    course_id     bigint  not null references courses (id) on delete cascade,
    instructor_id bigint  not null references instructors (id) on delete restrict,
    position      integer not null default 0,
    primary key (course_id, instructor_id)
);

create table course_tags (
    course_id bigint not null references courses (id) on delete cascade,
    tag       text   not null,
    primary key (course_id, tag)
);

alter table modules
    add column video_status       text   not null default 'none'
                                         check (video_status in ('none', 'uploaded', 'processing', 'ready', 'failed')),
    add column video_original_path text,
    add column hls_path           text,
    add column video_error        text,
    add column video_size_bytes   bigint check (video_size_bytes is null or video_size_bytes >= 0);

-- Deferrable so reordering modules can swap numbers inside one transaction.
alter table modules drop constraint modules_course_id_module_number_key;
alter table modules add constraint modules_course_id_module_number_key
    unique (course_id, module_number) deferrable initially deferred;
