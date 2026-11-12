alter table orders drop constraint if exists orders_manual_needs_reference;
alter table orders drop column if exists manual_reference, drop column if exists manual_method;
drop table if exists module_progress;
drop table if exists sessions;
