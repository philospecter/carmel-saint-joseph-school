create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('teacher_student','sm_teacher')),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  other_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_subject_rule check (
    (kind = 'teacher_student' and subject_id is not null) or
    (kind = 'sm_teacher' and subject_id is null)
  )
);

create unique index if not exists conversations_teacher_student_uniq
  on public.conversations (teacher_id, other_id, subject_id, academic_year_id)
  where kind = 'teacher_student';
create unique index if not exists conversations_sm_teacher_uniq
  on public.conversations (teacher_id, other_id, academic_year_id)
  where kind = 'sm_teacher';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);

grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant all on public.conversations to service_role;
grant all on public.messages to service_role;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create or replace function public.chat_relationship_exists(
  _kind text, _teacher_id uuid, _other_id uuid, _subject_id uuid, _year_id uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when _kind = 'teacher_student' then exists (
      select 1
      from public.teacher_assignments ta
      join public.subjects s on s.id = ta.subject_id
      join public.student_enrollments se
        on se.user_id = _other_id
       and se.academic_year_id = _year_id
       and se.grade_level = s.grade_level
       and se.stage_group = s.stage_group
       and se.is_graduated = false
      where ta.teacher_id = _teacher_id
        and ta.subject_id = _subject_id
        and ta.academic_year_id = _year_id
    )
    when _kind = 'sm_teacher' then exists (
      select 1
      from public.stage_manager_assignments sma
      join public.subjects s on s.stage_group = sma.stage_group
      join public.teacher_assignments ta
        on ta.subject_id = s.id
       and ta.teacher_id = _teacher_id
       and ta.academic_year_id = _year_id
      where sma.user_id = _other_id
    )
    else false
  end
$$;

drop policy if exists "chat participants can read conversations" on public.conversations;
create policy "chat participants can read conversations"
on public.conversations for select to authenticated
using (auth.uid() = teacher_id or auth.uid() = other_id);

drop policy if exists "participants can create real conversations" on public.conversations;
create policy "participants can create real conversations"
on public.conversations for insert to authenticated
with check (
  (auth.uid() = teacher_id or auth.uid() = other_id)
  and public.chat_relationship_exists(kind, teacher_id, other_id, subject_id, academic_year_id)
);

drop policy if exists "participants can read messages" on public.messages;
create policy "participants can read messages"
on public.messages for select to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = messages.conversation_id
    and (auth.uid() = c.teacher_id or auth.uid() = c.other_id)
));

drop policy if exists "participants can send messages" on public.messages;
create policy "participants can send messages"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (auth.uid() = c.teacher_id or auth.uid() = c.other_id)
  )
);

alter table public.messages replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
end $$;