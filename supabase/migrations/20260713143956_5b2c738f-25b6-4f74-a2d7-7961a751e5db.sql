-- 1) Make year_restrict truly restrictive on all year-scoped tables.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'grades','attendance','announcements','homework',
    'homework_submissions','teacher_assignments','student_enrollments'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS year_restrict ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY year_restrict ON public.%I AS RESTRICTIVE FOR ALL TO public
       USING (academic_year_id = public.current_academic_year_id())
       WITH CHECK (academic_year_id = public.current_academic_year_id())',
      t
    );
  END LOOP;
END $$;

-- 2) SECURITY DEFINER helper used by the promotion preview screen to see the
--    most recently closed year (past-year rows are hidden by the new restrictive policy).
CREATE OR REPLACE FUNCTION public.preview_promotion_roster()
RETURNS TABLE(user_id uuid, stage_group stage_group, grade_level grade_level, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH old AS (
    SELECT id FROM public.academic_years
    WHERE closed_at IS NOT NULL
    ORDER BY closed_at DESC
    LIMIT 1
  )
  SELECT se.user_id, se.stage_group, se.grade_level, COALESCE(p.full_name, '—') AS full_name
  FROM public.student_enrollments se
  LEFT JOIN public.profiles p ON p.id = se.user_id
  WHERE se.academic_year_id = (SELECT id FROM old)
    AND se.is_graduated = false
    AND public.has_role(auth.uid(), 'admin');
$$;

-- 3) SECURITY DEFINER counts for the historical year "View" page.
CREATE OR REPLACE FUNCTION public.year_scoped_counts(_year uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT jsonb_build_object(
    'enrollments',        (SELECT count(*) FROM public.student_enrollments   WHERE academic_year_id = _year),
    'grades',             (SELECT count(*) FROM public.grades                WHERE academic_year_id = _year),
    'attendance',         (SELECT count(*) FROM public.attendance            WHERE academic_year_id = _year),
    'teacher_assignments',(SELECT count(*) FROM public.teacher_assignments   WHERE academic_year_id = _year),
    'homework',           (SELECT count(*) FROM public.homework              WHERE academic_year_id = _year),
    'announcements',      (SELECT count(*) FROM public.announcements         WHERE academic_year_id = _year)
  ) INTO result;
  RETURN result;
END $$;

-- 4) SECURITY DEFINER helper: how many un-promoted students in most recently closed year?
CREATE OR REPLACE FUNCTION public.pending_promotion_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH old AS (
    SELECT id FROM public.academic_years
    WHERE closed_at IS NOT NULL
    ORDER BY closed_at DESC
    LIMIT 1
  ),
  current AS (SELECT id FROM public.academic_years WHERE is_current LIMIT 1)
  SELECT count(*)::int
  FROM public.student_enrollments se
  WHERE se.academic_year_id = (SELECT id FROM old)
    AND se.is_graduated = false
    AND NOT EXISTS (
      SELECT 1 FROM public.student_enrollments se2
      WHERE se2.user_id = se.user_id
        AND se2.academic_year_id = (SELECT id FROM current)
    )
    AND public.has_role(auth.uid(), 'admin');
$$;
