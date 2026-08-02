create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  r2_key text not null unique,
  file_type text not null,
  file_size_bytes bigint,
  category text not null default 'general',
  uploaded_by uuid not null references public.profiles(id),
  homework_id uuid references public.homework(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  stage_group public.stage_group,
  grade_level public.grade_level,
  academic_year_id uuid references public.academic_years(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_files_r2_key on public.files (r2_key);
create index if not exists idx_files_uploaded_by on public.files (uploaded_by);
create index if not exists idx_files_homework_id on public.files (homework_id) where homework_id is not null;
create index if not exists idx_files_announcement_id on public.files (announcement_id) where announcement_id is not null;
create index if not exists idx_files_expires_at on public.files (expires_at) where expires_at is not null;
create index if not exists idx_files_stage_grade on public.files (stage_group, grade_level) where stage_group is not null;

alter table public.files enable row level security;

drop policy if exists files_admin_manage on public.files;
create policy files_admin_manage on public.files
for all
using (has_role(auth.uid(), 'admin'::app_role))
with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists files_uploader_manage on public.files;
create policy files_uploader_manage on public.files
for all
using (uploaded_by = auth.uid())
with check (uploaded_by = auth.uid());

drop policy if exists files_sm_read on public.files;
create policy files_sm_read on public.files
for select
using (stage_group is not null and is_stage_manager_of(auth.uid(), stage_group));

-- Students see files matching their exact grade, or files scoped to their
-- whole stage with grade_level left NULL (used for stage-wide announcements).
-- Deliberately does NOT filter by is_graduated — a student who graduated
-- from a given stage/grade should still see files tied to that period.
drop policy if exists files_student_read on public.files;
create policy files_student_read on public.files
for select
using (
  stage_group is not null and exists (
    select 1 from public.student_enrollments se
    where se.user_id = auth.uid()
      and se.stage_group = files.stage_group
      and (files.grade_level is null or se.grade_level = files.grade_level)
  )
);

drop policy if exists files_year_restrict on public.files;
create policy files_year_restrict on public.files
for all
using (has_role(auth.uid(), 'admin'::app_role) or academic_year_id is null or academic_year_id = current_academic_year_id())
with check (has_role(auth.uid(), 'admin'::app_role) or academic_year_id is null or academic_year_id = current_academic_year_id());
