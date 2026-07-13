
-- Deterministic subject id derived from (stage, grade, name) via md5.
-- md5 is built-in; we format the 32 hex chars as a UUID and force
-- version/variant bits so it's a valid UUIDv5-shaped value.
CREATE OR REPLACE FUNCTION public.subject_uuid(
  _stage public.stage_group,
  _grade public.grade_level,
  _name text
) RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH h AS (
    SELECT md5('carmel-subject|' || _stage::text || '|' || _grade::text || '|' || lower(btrim(_name))) AS m
  )
  SELECT (
    substring(m,1,8) || '-' ||
    substring(m,9,4) || '-' ||
    '5' || substring(m,14,3) || '-' ||
    (to_hex(((('x'||substring(m,17,2))::bit(8)::int) & 63) | 128)) || substring(m,19,2) || '-' ||
    substring(m,21,12)
  )::uuid
  FROM h;
$$;

GRANT EXECUTE ON FUNCTION public.subject_uuid(public.stage_group, public.grade_level, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.subject_reference_counts(_subject uuid)
RETURNS TABLE(teachers bigint, homework bigint, grades bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.teacher_assignments WHERE subject_id = _subject),
    (SELECT count(*) FROM public.homework h
       JOIN public.teacher_assignments ta ON ta.id = h.teacher_assignment_id
      WHERE ta.subject_id = _subject),
    (SELECT count(*) FROM public.grades WHERE subject_id = _subject);
$$;

GRANT EXECUTE ON FUNCTION public.subject_reference_counts(uuid) TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.subjects TO authenticated;

DROP POLICY IF EXISTS "subjects_admin_manage" ON public.subjects;
CREATE POLICY "subjects_admin_manage" ON public.subjects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
