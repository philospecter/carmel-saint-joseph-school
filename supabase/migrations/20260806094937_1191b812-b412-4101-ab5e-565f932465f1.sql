-- 1. allow admin conversations
ALTER TABLE public.conversations DROP CONSTRAINT conversations_kind_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_kind_check
  CHECK (kind = ANY (ARRAY['teacher_student'::text, 'sm_teacher'::text, 'admin_user'::text]));
ALTER TABLE public.conversations DROP CONSTRAINT conversations_subject_rule;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_subject_rule
  CHECK ((kind = 'teacher_student' AND subject_id IS NOT NULL)
      OR (kind IN ('sm_teacher','admin_user') AND subject_id IS NULL));

CREATE OR REPLACE FUNCTION public.chat_relationship_exists(_kind text, _teacher_id uuid, _other_id uuid, _subject_id uuid, _year_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when _kind = 'admin_user' then public.has_role(_teacher_id, 'admin')
      and _teacher_id <> _other_id
      and exists (select 1 from public.profiles p where p.id = _other_id)
    else false
  end
$function$;

-- 2. read markers
CREATE TABLE public.message_reads (
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reads TO authenticated;
GRANT ALL ON public.message_reads TO service_role;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own read markers" ON public.message_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 3. unread helpers
CREATE OR REPLACE FUNCTION public.chat_unread()
 RETURNS TABLE(conversation_id uuid, kind text, teacher_id uuid, other_id uuid, subject_id uuid, unread integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select c.id, c.kind, c.teacher_id, c.other_id, c.subject_id, count(m.id)::int
  from public.conversations c
  join public.messages m on m.conversation_id = c.id
  left join public.message_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  where (c.teacher_id = auth.uid() or c.other_id = auth.uid())
    and m.sender_id <> auth.uid()
    and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by c.id, c.kind, c.teacher_id, c.other_id, c.subject_id
$function$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
     WHERE c.id = _conversation AND (c.teacher_id = auth.uid() OR c.other_id = auth.uid())
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  INSERT INTO public.message_reads(user_id, conversation_id, last_read_at)
  VALUES (auth.uid(), _conversation, now())
  ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = now();
END $function$;

-- 4. names for admin chat peers + admin peers for others
CREATE OR REPLACE FUNCTION public.chat_peer_names()
 RETURNS TABLE(id uuid, full_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with y as (select public.current_academic_year_id() as yid)
  select p.id, p.full_name
  from student_enrollments se
  join y on true
  join subjects s on s.stage_group = se.stage_group and s.grade_level = se.grade_level
  join teacher_assignments ta on ta.subject_id = s.id and ta.academic_year_id = y.yid
  join profiles p on p.id = ta.teacher_id
  where se.user_id = auth.uid() and se.academic_year_id = y.yid and se.is_graduated = false
  union
  select p.id, p.full_name
  from teacher_assignments ta
  join y on true
  join subjects s on s.id = ta.subject_id
  join student_enrollments se on se.stage_group = s.stage_group and se.grade_level = s.grade_level
   and se.academic_year_id = y.yid and se.is_graduated = false
  join profiles p on p.id = se.user_id
  where ta.teacher_id = auth.uid() and ta.academic_year_id = y.yid
  union
  select p.id, p.full_name
  from teacher_assignments ta
  join y on true
  join subjects s on s.id = ta.subject_id
  join stage_manager_assignments sma on sma.stage_group = s.stage_group
  join profiles p on p.id = sma.user_id
  where ta.teacher_id = auth.uid() and ta.academic_year_id = y.yid
  union
  select p.id, p.full_name
  from stage_manager_assignments sma
  join y on true
  join subjects s on s.stage_group = sma.stage_group
  join teacher_assignments ta on ta.subject_id = s.id and ta.academic_year_id = y.yid
  join profiles p on p.id = ta.teacher_id
  where sma.user_id = auth.uid()
  union
  -- admins the caller has an existing conversation with
  select p.id, p.full_name
  from conversations c
  join profiles p on p.id = c.teacher_id
  where c.kind = 'admin_user' and c.other_id = auth.uid()
  union
  -- anyone, when the caller is an admin
  select p.id, p.full_name
  from profiles p
  where public.has_role(auth.uid(), 'admin')
$function$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;