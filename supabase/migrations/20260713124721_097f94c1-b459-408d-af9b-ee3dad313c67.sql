
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS max_score numeric;
UPDATE public.grades g SET max_score = s.max_score FROM public.subjects s
 WHERE g.subject_id = s.id AND g.max_score IS NULL AND s.max_score IS NOT NULL;
UPDATE public.grades SET max_score = GREATEST(score, 100) WHERE max_score IS NULL;
ALTER TABLE public.grades ALTER COLUMN max_score SET NOT NULL;
ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_max_score_positive;
ALTER TABLE public.grades ADD CONSTRAINT grades_max_score_positive CHECK (max_score > 0);

CREATE OR REPLACE FUNCTION public.grades_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.term::text IN ('term_1','term_2') THEN
    IF NEW.month IS NULL THEN RAISE EXCEPTION 'month is required for term_1/term_2'; END IF;
  ELSE
    IF NEW.month IS NOT NULL THEN RAISE EXCEPTION 'month must be null for midyear/final'; END IF;
  END IF;
  IF NEW.max_score IS NULL OR NEW.max_score <= 0 THEN RAISE EXCEPTION 'max_score must be a positive number'; END IF;
  IF NEW.score < 0 OR NEW.score > NEW.max_score THEN RAISE EXCEPTION 'Score % is outside allowed range 0..%', NEW.score, NEW.max_score; END IF;
  RETURN NEW;
END; $function$;

ALTER TABLE public.subjects DROP COLUMN IF EXISTS max_score;

CREATE OR REPLACE FUNCTION public.set_grade_cell_max(_subject uuid, _term text, _month int, _new_max numeric)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller uuid := auth.uid(); s_stage stage_group; affected integer; current_year uuid := public.current_academic_year_id();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _new_max IS NULL OR _new_max <= 0 THEN RAISE EXCEPTION 'max_score must be a positive number'; END IF;
  s_stage := public.subject_stage(_subject);
  IF NOT (public.has_role(caller,'admin') OR public.is_stage_manager_of(caller, s_stage)
    OR EXISTS (SELECT 1 FROM public.teacher_assignments WHERE teacher_id=caller AND subject_id=_subject))
  THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.grades SET max_score=_new_max
    WHERE subject_id=_subject AND term::text=_term
      AND ((_month IS NULL AND month IS NULL) OR month=_month)
      AND academic_year_id=current_year;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.set_grade_cell_max(uuid, text, int, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_grade_cell_max(uuid, text, int, numeric) TO authenticated;

ALTER TABLE public.teacher_assignments DROP CONSTRAINT IF EXISTS teacher_assignments_teacher_id_subject_id_key;
ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_teacher_subject_year_key UNIQUE (teacher_id, subject_id, academic_year_id);
ALTER TABLE public.student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_user_id_key;
ALTER TABLE public.student_enrollments ADD CONSTRAINT student_enrollments_user_year_key UNIQUE (user_id, academic_year_id);
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_student_id_date_key;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_date_year_key UNIQUE (student_id, date, academic_year_id);

CREATE OR REPLACE FUNCTION public.start_new_academic_year(_label text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE old_id uuid; new_id uuid; caller uuid := auth.uid(); clean_label text := btrim(_label);
BEGIN
  IF NOT public.has_role(caller,'admin') THEN RAISE EXCEPTION 'Only admins can start a new academic year'; END IF;
  IF clean_label IS NULL OR clean_label='' THEN RAISE EXCEPTION 'Academic year label is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.academic_years WHERE lower(label)=lower(clean_label)) THEN RAISE EXCEPTION 'A year with this label already exists'; END IF;
  SELECT id INTO old_id FROM public.academic_years WHERE is_current;
  IF old_id IS NULL THEN RAISE EXCEPTION 'No current academic year found'; END IF;
  UPDATE public.academic_years SET is_current=false, closed_at=now() WHERE id=old_id;
  INSERT INTO public.academic_years(label, is_current) VALUES (clean_label, true) RETURNING id INTO new_id;
  UPDATE public.signup_requests SET status='rejected', reviewed_by=caller, reviewed_at=now() WHERE status='pending';
  INSERT INTO public.teacher_assignments (teacher_id, subject_id, academic_year_id)
    SELECT teacher_id, subject_id, new_id FROM public.teacher_assignments WHERE academic_year_id = old_id
    ON CONFLICT ON CONSTRAINT teacher_assignments_teacher_subject_year_key DO NOTHING;
  RETURN new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.promote_students(_promotions jsonb, _repeats uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE new_id uuid; old_id uuid; caller uuid := auth.uid(); r RECORD; mapping jsonb; to_stage stage_group; to_grade grade_level;
BEGIN
  IF NOT public.has_role(caller,'admin') THEN RAISE EXCEPTION 'Only admins can promote students'; END IF;
  SELECT id INTO new_id FROM public.academic_years WHERE is_current;
  SELECT id INTO old_id FROM public.academic_years WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1;
  IF new_id IS NULL OR old_id IS NULL THEN RAISE EXCEPTION 'Cannot promote: missing current or previous academic year'; END IF;
  FOR r IN SELECT user_id, stage_group, grade_level FROM public.student_enrollments WHERE academic_year_id=old_id AND is_graduated=false LOOP
    IF EXISTS (SELECT 1 FROM public.student_enrollments WHERE user_id=r.user_id AND academic_year_id=new_id) THEN CONTINUE; END IF;
    IF r.user_id = ANY(_repeats) THEN
      INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
        VALUES (r.user_id, r.stage_group, r.grade_level, new_id, false)
        ON CONFLICT ON CONSTRAINT student_enrollments_user_year_key DO NOTHING;
      CONTINUE;
    END IF;
    IF r.grade_level='sec3' THEN
      INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
        VALUES (r.user_id, r.stage_group, r.grade_level, new_id, true)
        ON CONFLICT ON CONSTRAINT student_enrollments_user_year_key DO NOTHING;
      CONTINUE;
    END IF;
    SELECT p INTO mapping FROM jsonb_array_elements(_promotions) p
      WHERE (p->>'from_stage')=r.stage_group::text AND (p->>'from_grade')=r.grade_level::text LIMIT 1;
    IF mapping IS NULL THEN
      CASE r.grade_level::text
        WHEN 'p1' THEN to_stage:='primary_1_2'; to_grade:='p2';
        WHEN 'p2' THEN to_stage:='primary_3_6'; to_grade:='p3';
        WHEN 'p3' THEN to_stage:='primary_3_6'; to_grade:='p4';
        WHEN 'p4' THEN to_stage:='primary_3_6'; to_grade:='p5';
        WHEN 'p5' THEN to_stage:='primary_3_6'; to_grade:='p6';
        WHEN 'p6' THEN to_stage:='preparatory'; to_grade:='prep1';
        WHEN 'prep1' THEN to_stage:='preparatory'; to_grade:='prep2';
        WHEN 'prep2' THEN to_stage:='preparatory'; to_grade:='prep3';
        WHEN 'prep3' THEN to_stage:='secondary'; to_grade:='sec1';
        WHEN 'sec1' THEN to_stage:='secondary'; to_grade:='sec2';
        WHEN 'sec2' THEN to_stage:='secondary'; to_grade:='sec3';
      END CASE;
    ELSE
      to_stage := (mapping->>'to_stage')::stage_group; to_grade := (mapping->>'to_grade')::grade_level;
    END IF;
    INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
      VALUES (r.user_id, to_stage, to_grade, new_id, false)
      ON CONFLICT ON CONSTRAINT student_enrollments_user_year_key DO NOTHING;
  END LOOP;
END $function$;
