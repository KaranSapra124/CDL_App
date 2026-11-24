-- Student profile photo. The path is relative to MEDIA_DIR (e.g. avatars/student-9/<random>.jpg).
alter table students add column avatar_path text;
