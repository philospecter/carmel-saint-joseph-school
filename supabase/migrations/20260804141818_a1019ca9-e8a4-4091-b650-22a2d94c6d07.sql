-- Approve grades: admin (any) or stage manager (own stages)
CREATE OR REPLACE FUNCTION public.approve_grades(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE caller uuid := auth.uid(); affected int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.grades g
     SET approved_at = now(), approved_by = caller
   WHERE g.id = ANY(_ids)
     AND g.approved_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.subjects s
        WHERE s.id = g.subject_id
          AND (public.has_role(caller,'admin') OR public.is_stage_manager_of(caller, s.stage_group))
     );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $function$;

-- Count of pending grades in the caller's scope (current year)
CREATE OR REPLACE FUNCTION public.pending_grades_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
  FROM public.grades g
  JOIN public.subjects s ON s.id = g.subject_id
  WHERE g.approved_at IS NULL
    AND g.academic_year_id = public.current_academic_year_id()
    AND (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), s.stage_group));
$function$;

-- Pending cells grouped by subject/term/month in the caller's scope
CREATE OR REPLACE FUNCTION public.pending_grade_cells()
RETURNS TABLE(subject_id uuid, subject_name text, stage_group stage_group, grade_level grade_level, term term_type, month smallint, pending_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name, s.stage_group, s.grade_level, g.term, g.month, count(*)::int
  FROM public.grades g
  JOIN public.subjects s ON s.id = g.subject_id
  WHERE g.approved_at IS NULL
    AND g.academic_year_id = public.current_academic_year_id()
    AND (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), s.stage_group))
  GROUP BY s.id, s.name, s.stage_group, s.grade_level, g.term, g.month
  ORDER BY s.stage_group, s.grade_level, s.name, g.term, g.month;
$function$;

-- Bulk approve everything pending in the caller's scope
CREATE OR REPLACE FUNCTION public.approve_all_pending()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE caller uuid := auth.uid(); affected int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.grades g
     SET approved_at = now(), approved_by = caller
   WHERE g.approved_at IS NULL
     AND g.academic_year_id = public.current_academic_year_id()
     AND EXISTS (
       SELECT 1 FROM public.subjects s
        WHERE s.id = g.subject_id
          AND (public.has_role(caller,'admin') OR public.is_stage_manager_of(caller, s.stage_group))
     );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $function$;

-- Teachers may change a cell's max score only while nothing in it is approved
CREATE OR REPLACE FUNCTION public.set_grade_cell_max(_subject uuid, _term text, _month integer, _new_max numeric)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE caller uuid := auth.uid(); s_stage stage_group; affected integer; current_year uuid := public.current_academic_year_id(); is_staff boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _new_max IS NULL OR _new_max <= 0 THEN RAISE EXCEPTION 'max_score must be a positive number'; END IF;
  s_stage := public.subject_stage(_subject);
  is_staff := public.has_role(caller,'admin') OR public.is_stage_manager_of(caller, s_stage);
  IF NOT (is_staff OR EXISTS (SELECT 1 FROM public.teacher_assignments WHERE teacher_id=caller AND subject_id=_subject))
  THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF NOT is_staff AND EXISTS (
    SELECT 1 FROM public.grades
     WHERE subject_id=_subject AND term::text=_term
       AND ((_month IS NULL AND month IS NULL) OR month=_month)
       AND academic_year_id=current_year
       AND approved_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'These grades were already approved by an administrator and the max score can no longer be changed';
  END IF;

  UPDATE public.grades SET max_score=_new_max, score = LEAST(score, _new_max)
    WHERE subject_id=_subject AND term::text=_term
      AND ((_month IS NULL AND month IS NULL) OR month=_month)
      AND academic_year_id=current_year;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $function$;