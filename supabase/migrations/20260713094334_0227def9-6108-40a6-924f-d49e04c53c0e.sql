
-- 1) Per-row max_score on grades; drop subjects.max_score
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS max_score numeric;

-- Backfill from subjects.max_score where available
UPDATE public.grades g
   SET max_score = s.max_score
  FROM public.subjects s
 WHERE g.subject_id = s.id
   AND g.max_score IS NULL
   AND s.max_score IS NOT NULL;

-- Any remaining rows: fall back to a floor of GREATEST(score, 100)
UPDATE public.grades
   SET max_score = GREATEST(score, 100)
 WHERE max_score IS NULL;

ALTER TABLE public.grades
  ALTER COLUMN max_score SET NOT NULL;

ALTER TABLE public.grades
  DROP CONSTRAINT IF EXISTS grades_max_score_positive;
ALTER TABLE public.grades
  ADD CONSTRAINT grades_max_score_positive CHECK (max_score > 0);

-- Rewrite validator to use per-row max_score
CREATE OR REPLACE FUNCTION public.grades_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.term::text IN ('term_1','term_2') THEN
    IF NEW.month IS NULL THEN
      RAISE EXCEPTION 'month is required for term_1/term_2';
    END IF;
  ELSE
    IF NEW.month IS NOT NULL THEN
      RAISE EXCEPTION 'month must be null for midyear/final';
    END IF;
  END IF;

  IF NEW.max_score IS NULL OR NEW.max_score <= 0 THEN
    RAISE EXCEPTION 'max_score must be a positive number';
  END IF;
  IF NEW.score < 0 OR NEW.score > NEW.max_score THEN
    RAISE EXCEPTION 'Score % is outside allowed range 0..%', NEW.score, NEW.max_score;
  END IF;

  RETURN NEW;
END;
$function$;

-- Now safe to drop subjects.max_score
ALTER TABLE public.subjects DROP COLUMN IF EXISTS max_score;

-- 2) RPC to rescale an entire cell's max_score (admin / stage manager of stage / teacher assigned to subject)
CREATE OR REPLACE FUNCTION public.set_grade_cell_max(
  _subject uuid,
  _term text,
  _month int,
  _new_max numeric
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller uuid := auth.uid();
  s_stage stage_group;
  affected integer;
  current_year uuid := public.current_academic_year_id();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _new_max IS NULL OR _new_max <= 0 THEN
    RAISE EXCEPTION 'max_score must be a positive number';
  END IF;

  s_stage := public.subject_stage(_subject);
  IF NOT (
    public.has_role(caller, 'admin')
    OR public.is_stage_manager_of(caller, s_stage)
    OR EXISTS (
      SELECT 1 FROM public.teacher_assignments
      WHERE teacher_id = caller AND subject_id = _subject
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.grades
     SET max_score = _new_max
   WHERE subject_id = _subject
     AND term::text = _term
     AND ((_month IS NULL AND month IS NULL) OR month = _month)
     AND academic_year_id = current_year;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.set_grade_cell_max(uuid, text, int, numeric) FROM public;
REVOKE ALL ON FUNCTION public.set_grade_cell_max(uuid, text, int, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_grade_cell_max(uuid, text, int, numeric) TO authenticated;

-- 3) Nicer duplicate label error for start_new_academic_year
-- (Keep body intact; existing INSERT will raise SQLSTATE 23505 which the app maps to a friendly toast.)
