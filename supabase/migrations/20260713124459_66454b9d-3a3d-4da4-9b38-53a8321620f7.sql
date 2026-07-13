
ALTER TABLE public.homework ADD COLUMN IF NOT EXISTS link_url TEXT;

DELETE FROM public.grades;
DELETE FROM public.subjects;

INSERT INTO public.subjects (stage_group, grade_level, name)
SELECT s.stage_group::stage_group, s.grade_level::grade_level, n
FROM (VALUES ('primary_1_2','p1'), ('primary_1_2','p2'),
  ('primary_3_6','p3'), ('primary_3_6','p4'), ('primary_3_6','p5'), ('primary_3_6','p6')) AS s(stage_group, grade_level),
LATERAL (VALUES ('Arabic'),('Maths'),('Religion'),('French'),('English')) AS x(n);

INSERT INTO public.subjects (stage_group, grade_level, name)
SELECT 'preparatory'::stage_group, s.grade_level::grade_level, n
FROM (VALUES ('prep1'),('prep2'),('prep3')) AS s(grade_level),
LATERAL (VALUES ('Arabic'),('Maths'),('Religion'),('French'),('English'),('Science'),('Social Studies')) AS x(n);

INSERT INTO public.subjects (stage_group, grade_level, name)
SELECT 'secondary'::stage_group, s.grade_level::grade_level, n
FROM (VALUES ('sec1'),('sec2'),('sec3')) AS s(grade_level),
LATERAL (VALUES ('Arabic'),('Maths'),('Religion'),('French'),('English'),('History'),('Geography'),('Philosophy'),('Integrated Science'),('Chemistry'),('Physics'),('Biology')) AS x(n);

DROP TABLE IF EXISTS public.grades CASCADE;

CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  term term_type NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  score numeric NOT NULL,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, term, month));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grades TO authenticated;
GRANT ALL ON public.grades TO service_role;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student can read own grades" ON public.grades FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Admin full grades" ON public.grades FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Stage manager manages grades in stage" ON public.grades FOR ALL TO authenticated USING (public.student_of_stage_manager(student_id, auth.uid())) WITH CHECK (public.student_of_stage_manager(student_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.grades_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER grades_updated_at BEFORE UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION public.grades_touch_updated_at();

ALTER TABLE public.homework_submissions ADD CONSTRAINT homework_submissions_student_homework_unique UNIQUE (homework_id, student_id);
