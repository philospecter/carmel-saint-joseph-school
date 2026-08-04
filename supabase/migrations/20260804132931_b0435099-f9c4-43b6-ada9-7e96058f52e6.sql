create or replace function public.chat_peer_names()
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  with y as (select public.current_academic_year_id() as yid)
  -- teachers of the caller's subjects (caller is a student)
  select p.id, p.full_name
  from student_enrollments se
  join y on true
  join subjects s
    on s.stage_group = se.stage_group and s.grade_level = se.grade_level
  join teacher_assignments ta
    on ta.subject_id = s.id and ta.academic_year_id = y.yid
  join profiles p on p.id = ta.teacher_id
  where se.user_id = auth.uid()
    and se.academic_year_id = y.yid
    and se.is_graduated = false

  union
  -- students in the caller's assigned subjects (caller is a teacher)
  select p.id, p.full_name
  from teacher_assignments ta
  join y on true
  join subjects s on s.id = ta.subject_id
  join student_enrollments se
    on se.stage_group = s.stage_group
   and se.grade_level = s.grade_level
   and se.academic_year_id = y.yid
   and se.is_graduated = false
  join profiles p on p.id = se.user_id
  where ta.teacher_id = auth.uid()
    and ta.academic_year_id = y.yid

  union
  -- stage managers of the stages the caller teaches (caller is a teacher)
  select p.id, p.full_name
  from teacher_assignments ta
  join y on true
  join subjects s on s.id = ta.subject_id
  join stage_manager_assignments sma on sma.stage_group = s.stage_group
  join profiles p on p.id = sma.user_id
  where ta.teacher_id = auth.uid()
    and ta.academic_year_id = y.yid

  union
  -- teachers in the caller's managed stages (caller is a stage manager)
  select p.id, p.full_name
  from stage_manager_assignments sma
  join y on true
  join subjects s on s.stage_group = sma.stage_group
  join teacher_assignments ta
    on ta.subject_id = s.id and ta.academic_year_id = y.yid
  join profiles p on p.id = ta.teacher_id
  where sma.user_id = auth.uid()
$$;

grant execute on function public.chat_peer_names() to authenticated;