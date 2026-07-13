
-- 1. academic_years table
CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  is_current boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.academic_years TO authenticated;
GRANT ALL ON public.academic_years TO service_role;

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "year_read_all" ON public.academic_years
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "year_admin_all" ON public.academic_years
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX academic_years_one_current
  ON public.academic_years(is_current) WHERE is_current;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER academic_years_touch
  BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Seed initial year
INSERT INTO public.academic_years(label, is_current) VALUES ('2025-2026', true);

-- 3. Helper
CREATE OR REPLACE FUNCTION public.current_academic_year_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.academic_years WHERE is_current LIMIT 1;
$$;

-- 4. is_graduated on student_enrollments
ALTER TABLE public.student_enrollments
  ADD COLUMN is_graduated boolean NOT NULL DEFAULT false;

-- 5. Add academic_year_id to year-sensitive tables, backfill, NOT NULL + default + FK + index
DO $$
DECLARE
  t text;
  seed uuid;
BEGIN
  SELECT id INTO seed FROM public.academic_years WHERE is_current;
  FOREACH t IN ARRAY ARRAY[
    'student_enrollments','grades','attendance','teacher_assignments',
    'homework','homework_submissions','announcements'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN academic_year_id uuid REFERENCES public.academic_years(id)', t);
    EXECUTE format('UPDATE public.%I SET academic_year_id = %L WHERE academic_year_id IS NULL', t, seed);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN academic_year_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN academic_year_id SET DEFAULT public.current_academic_year_id()', t);
    EXECUTE format('CREATE INDEX %I ON public.%I(academic_year_id)', t||'_year_idx', t);
  END LOOP;
END $$;

-- 6. RESTRICTIVE policies limiting non-admin access to current-year rows
CREATE POLICY "year_restrict" ON public.student_enrollments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id());

CREATE POLICY "year_restrict" ON public.grades
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id());

CREATE POLICY "year_restrict" ON public.attendance
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id());

CREATE POLICY "year_restrict" ON public.teacher_assignments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id());

CREATE POLICY "year_restrict" ON public.homework
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id());

CREATE POLICY "year_restrict" ON public.homework_submissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id());

CREATE POLICY "year_restrict" ON public.announcements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR academic_year_id = public.current_academic_year_id());

-- 7. Rollover + promotion RPCs
CREATE OR REPLACE FUNCTION public.start_new_academic_year(_label text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_id uuid;
  new_id uuid;
  caller uuid := auth.uid();
BEGIN
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can start a new academic year';
  END IF;

  SELECT id INTO old_id FROM public.academic_years WHERE is_current;
  IF old_id IS NULL THEN
    RAISE EXCEPTION 'No current academic year found';
  END IF;

  UPDATE public.academic_years
    SET is_current = false, closed_at = now()
    WHERE id = old_id;

  INSERT INTO public.academic_years(label, is_current)
    VALUES (_label, true)
    RETURNING id INTO new_id;

  UPDATE public.signup_requests
    SET status = 'rejected', reviewed_by = caller, reviewed_at = now()
    WHERE status = 'pending';

  INSERT INTO public.teacher_assignments (teacher_id, subject_id, academic_year_id)
    SELECT teacher_id, subject_id, new_id
    FROM public.teacher_assignments
    WHERE academic_year_id = old_id;

  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.promote_students(_promotions jsonb, _repeats uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id uuid;
  old_id uuid;
  caller uuid := auth.uid();
  r RECORD;
  mapping jsonb;
  to_stage stage_group;
  to_grade grade_level;
BEGIN
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can promote students';
  END IF;

  SELECT id INTO new_id FROM public.academic_years WHERE is_current;
  SELECT id INTO old_id FROM public.academic_years
    WHERE closed_at IS NOT NULL
    ORDER BY closed_at DESC LIMIT 1;

  IF new_id IS NULL OR old_id IS NULL THEN
    RAISE EXCEPTION 'Cannot promote: missing current or previous academic year';
  END IF;

  FOR r IN
    SELECT user_id, stage_group, grade_level
    FROM public.student_enrollments
    WHERE academic_year_id = old_id AND is_graduated = false
  LOOP
    -- Skip if already enrolled in new year
    IF EXISTS (SELECT 1 FROM public.student_enrollments
               WHERE user_id = r.user_id AND academic_year_id = new_id) THEN
      CONTINUE;
    END IF;

    IF r.user_id = ANY(_repeats) THEN
      INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
        VALUES (r.user_id, r.stage_group, r.grade_level, new_id, false);
      CONTINUE;
    END IF;

    IF r.grade_level = 'sec3' THEN
      INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
        VALUES (r.user_id, r.stage_group, r.grade_level, new_id, true);
      CONTINUE;
    END IF;

    SELECT p INTO mapping FROM jsonb_array_elements(_promotions) p
      WHERE (p->>'from_stage') = r.stage_group::text
        AND (p->>'from_grade') = r.grade_level::text
      LIMIT 1;

    IF mapping IS NULL THEN
      -- Default mapping via linear progression
      CASE r.grade_level::text
        WHEN 'p1' THEN to_stage := 'primary_1_2'; to_grade := 'p2';
        WHEN 'p2' THEN to_stage := 'primary_3_6'; to_grade := 'p3';
        WHEN 'p3' THEN to_stage := 'primary_3_6'; to_grade := 'p4';
        WHEN 'p4' THEN to_stage := 'primary_3_6'; to_grade := 'p5';
        WHEN 'p5' THEN to_stage := 'primary_3_6'; to_grade := 'p6';
        WHEN 'p6' THEN to_stage := 'preparatory'; to_grade := 'prep1';
        WHEN 'prep1' THEN to_stage := 'preparatory'; to_grade := 'prep2';
        WHEN 'prep2' THEN to_stage := 'preparatory'; to_grade := 'prep3';
        WHEN 'prep3' THEN to_stage := 'secondary'; to_grade := 'sec1';
        WHEN 'sec1' THEN to_stage := 'secondary'; to_grade := 'sec2';
        WHEN 'sec2' THEN to_stage := 'secondary'; to_grade := 'sec3';
      END CASE;
    ELSE
      to_stage := (mapping->>'to_stage')::stage_group;
      to_grade := (mapping->>'to_grade')::grade_level;
    END IF;

    INSERT INTO public.student_enrollments(user_id, stage_group, grade_level, academic_year_id, is_graduated)
      VALUES (r.user_id, to_stage, to_grade, new_id, false);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.start_new_academic_year(text) FROM public;
GRANT EXECUTE ON FUNCTION public.start_new_academic_year(text) TO authenticated;
REVOKE ALL ON FUNCTION public.promote_students(jsonb, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.promote_students(jsonb, uuid[]) TO authenticated;
