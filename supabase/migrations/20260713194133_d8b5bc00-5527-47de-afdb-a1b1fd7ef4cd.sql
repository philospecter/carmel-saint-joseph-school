
-- 1) start_year_and_promote: atomically closes current year, creates new one,
-- copies teacher assignments, and inserts new-year enrollments per promotion map + repeats.
CREATE OR REPLACE FUNCTION public.start_year_and_promote(
  _label text,
  _promotions jsonb,
  _repeats uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  caller uuid := auth.uid();
  clean_label text := btrim(_label);
  old_id uuid;
  new_id uuid;
  r RECORD;
  mapping jsonb;
  to_stage stage_group;
  to_grade grade_level;
BEGIN
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can start a new academic year';
  END IF;
  IF clean_label IS NULL OR clean_label = '' THEN
    RAISE EXCEPTION 'Academic year label is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.academic_years WHERE lower(label) = lower(clean_label)) THEN
    RAISE EXCEPTION 'A year with this label already exists';
  END IF;

  SELECT id INTO old_id FROM public.academic_years WHERE is_current;
  IF old_id IS NULL THEN
    RAISE EXCEPTION 'No current academic year found';
  END IF;

  -- Close current, insert new-current
  UPDATE public.academic_years SET is_current = false, closed_at = now() WHERE id = old_id;
  INSERT INTO public.academic_years(label, is_current) VALUES (clean_label, true) RETURNING id INTO new_id;

  -- Reject pending signup requests
  UPDATE public.signup_requests
    SET status = 'rejected', reviewed_by = caller, reviewed_at = now()
    WHERE status = 'pending';

  -- Copy teacher assignments forward
  INSERT INTO public.teacher_assignments (teacher_id, subject_id, academic_year_id)
  SELECT teacher_id, subject_id, new_id
    FROM public.teacher_assignments
    WHERE academic_year_id = old_id
  ON CONFLICT ON CONSTRAINT teacher_assignments_teacher_subject_year_key DO NOTHING;

  -- Promote / repeat / graduate students from just-closed year into new year
  FOR r IN
    SELECT user_id, stage_group, grade_level
      FROM public.student_enrollments
      WHERE academic_year_id = old_id AND is_graduated = false
  LOOP
    -- Skip if already enrolled in new year (defensive)
    IF EXISTS (
      SELECT 1 FROM public.student_enrollments
       WHERE user_id = r.user_id AND academic_year_id = new_id
    ) THEN CONTINUE; END IF;

    IF r.user_id = ANY(_repeats) THEN
      INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
      VALUES (r.user_id, r.stage_group, r.grade_level, new_id, false)
      ON CONFLICT ON CONSTRAINT student_enrollments_user_year_key DO NOTHING;
      CONTINUE;
    END IF;

    IF r.grade_level = 'sec3' THEN
      INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
      VALUES (r.user_id, r.stage_group, r.grade_level, new_id, true)
      ON CONFLICT ON CONSTRAINT student_enrollments_user_year_key DO NOTHING;
      CONTINUE;
    END IF;

    -- Look up explicit mapping first
    SELECT p INTO mapping FROM jsonb_array_elements(_promotions) p
      WHERE (p->>'from_stage') = r.stage_group::text
        AND (p->>'from_grade') = r.grade_level::text
      LIMIT 1;

    IF mapping IS NULL THEN
      CASE r.grade_level::text
        WHEN 'p1'    THEN to_stage := 'primary_1_2';  to_grade := 'p2';
        WHEN 'p2'    THEN to_stage := 'primary_3_6';  to_grade := 'p3';
        WHEN 'p3'    THEN to_stage := 'primary_3_6';  to_grade := 'p4';
        WHEN 'p4'    THEN to_stage := 'primary_3_6';  to_grade := 'p5';
        WHEN 'p5'    THEN to_stage := 'primary_3_6';  to_grade := 'p6';
        WHEN 'p6'    THEN to_stage := 'preparatory';  to_grade := 'prep1';
        WHEN 'prep1' THEN to_stage := 'preparatory';  to_grade := 'prep2';
        WHEN 'prep2' THEN to_stage := 'preparatory';  to_grade := 'prep3';
        WHEN 'prep3' THEN to_stage := 'secondary';    to_grade := 'sec1';
        WHEN 'sec1'  THEN to_stage := 'secondary';    to_grade := 'sec2';
        WHEN 'sec2'  THEN to_stage := 'secondary';    to_grade := 'sec3';
        ELSE RAISE EXCEPTION 'No promotion mapping for grade %', r.grade_level;
      END CASE;
    ELSE
      to_stage := (mapping->>'to_stage')::stage_group;
      to_grade := (mapping->>'to_grade')::grade_level;
    END IF;

    INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
    VALUES (r.user_id, to_stage, to_grade, new_id, false)
    ON CONFLICT ON CONSTRAINT student_enrollments_user_year_key DO NOTHING;
  END LOOP;

  RETURN new_id;
END
$fn$;

-- 2) delete_academic_year: cascade-delete all data scoped to a non-current year.
CREATE OR REPLACE FUNCTION public.delete_academic_year(_year uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  caller uuid := auth.uid();
  is_cur boolean;
  total int;
BEGIN
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete academic years';
  END IF;
  SELECT is_current INTO is_cur FROM public.academic_years WHERE id = _year;
  IF is_cur IS NULL THEN
    RAISE EXCEPTION 'Year not found';
  END IF;
  IF is_cur THEN
    RAISE EXCEPTION 'Cannot delete the currently active year. Set another year as current first.';
  END IF;
  SELECT count(*) INTO total FROM public.academic_years;
  IF total <= 1 THEN
    RAISE EXCEPTION 'Cannot delete the only remaining academic year.';
  END IF;

  -- Delete year-scoped data explicitly (FKs do not cascade)
  DELETE FROM public.homework_answers
   WHERE submission_id IN (SELECT id FROM public.homework_submissions WHERE academic_year_id = _year);
  DELETE FROM public.homework_submissions WHERE academic_year_id = _year;
  DELETE FROM public.homework                WHERE academic_year_id = _year;
  DELETE FROM public.grades                  WHERE academic_year_id = _year;
  DELETE FROM public.attendance              WHERE academic_year_id = _year;
  DELETE FROM public.announcements           WHERE academic_year_id = _year;
  DELETE FROM public.teacher_assignments     WHERE academic_year_id = _year;
  DELETE FROM public.student_enrollments     WHERE academic_year_id = _year;

  DELETE FROM public.academic_years WHERE id = _year;
END
$fn$;

-- 3) rename_academic_year: change label only, refuse duplicates
CREATE OR REPLACE FUNCTION public.rename_academic_year(_year uuid, _label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  caller uuid := auth.uid();
  clean_label text := btrim(_label);
BEGIN
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can rename academic years';
  END IF;
  IF clean_label IS NULL OR clean_label = '' THEN
    RAISE EXCEPTION 'Academic year label is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = _year) THEN
    RAISE EXCEPTION 'Year not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.academic_years
     WHERE lower(label) = lower(clean_label) AND id <> _year
  ) THEN
    RAISE EXCEPTION 'A year with this label already exists';
  END IF;
  UPDATE public.academic_years SET label = clean_label WHERE id = _year;
END
$fn$;

-- 4) set_current_academic_year: flip which year is current
CREATE OR REPLACE FUNCTION public.set_current_academic_year(_year uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can change the current year';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = _year) THEN
    RAISE EXCEPTION 'Year not found';
  END IF;
  -- Deferred-style: close old current first, then set new current.
  -- The academic_years_one_current partial unique index enforces at most one is_current=true.
  UPDATE public.academic_years
     SET is_current = false,
         closed_at  = COALESCE(closed_at, now())
   WHERE is_current AND id <> _year;

  UPDATE public.academic_years
     SET is_current = true,
         closed_at  = NULL
   WHERE id = _year;
END
$fn$;
