alter table modules drop constraint modules_course_id_module_number_key;
alter table modules add constraint modules_course_id_module_number_key unique (course_id, module_number);

alter table modules
    drop column video_size_bytes,
    drop column video_error,
    drop column hls_path,
    drop column video_original_path,
    drop column video_status;

drop table if exists course_tags;
drop table if exists course_instructors;

alter table courses
    drop column category_id,
    drop column primary_language,
    drop column visibility,
    drop column certificate_enabled,
    drop column mrp_paise,
    drop column thumbnail_path;

drop table if exists instructors;
drop table if exists categories;
