create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  r2_key text not null unique,
  file_type text not null,
  file_size_bytes bigint not null default 0,
  category text not null default 'general',
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  homework_id uuid references public.homework(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  stage_group public.stage_group,
  grade_level public.grade_level,
  academic_year_id uuid references public.academic_years(id) on delete cascade default public.current_academic_year_id(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists files_homework_id_idx on public.files(homework_id);
create index if not exists files_announcement_id_idx on public.files(announcement_id);

grant select, insert, update, delete on public.files to authenticated;
grant all on public.files to service_role;

alter table public.files enable row level security;

drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    public.has_role(auth.uid(), 'admin')
    or (stage_group is not null and public.is_stage_manager_of(auth.uid(), stage_group))
    or (
      homework_id is not null and exists (
        select 1 from public.homework h
        where h.id = homework_id and public.teacher_owns_assignment(auth.uid(), h.teacher_assignment_id)
      )
    )
  )
);

drop policy if exists files_owner_manage on public.files;
create policy files_owner_manage on public.files for delete to authenticated
using (uploaded_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists files_staff_read on public.files;
create policy files_staff_read on public.files for select to authenticated
using (
  uploaded_by = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or (stage_group is not null and public.is_stage_manager_of(auth.uid(), stage_group))
  or (
    homework_id is not null and exists (
      select 1 from public.homework h
      where h.id = homework_id and public.teacher_owns_assignment(auth.uid(), h.teacher_assignment_id)
    )
  )
);

drop policy if exists files_student_read on public.files;
create policy files_student_read on public.files for select to authenticated
using (
  exists (
    select 1 from public.student_enrollments se
    where se.user_id = auth.uid()
      and se.is_graduated = false
      and se.stage_group = files.stage_group
      and (files.grade_level is null or files.grade_level = se.grade_level)
  )
);