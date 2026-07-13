
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS max_score numeric NULL CHECK (max_score IS NULL OR max_score > 0);

ALTER TABLE public.grades ALTER COLUMN month DROP NOT NULL;
ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_month_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_month_range_chk CHECK (month IS NULL OR (month BETWEEN 1 AND 12));

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_student_id_subject_id_term_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS grades_uniq_monthly ON public.grades (student_id, subject_id, term, month) WHERE month IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS grades_uniq_termly ON public.grades (student_id, subject_id, term) WHERE month IS NULL;

CREATE OR REPLACE FUNCTION public.grades_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s_max numeric;
BEGIN
  IF NEW.term::text IN ('term_1','term_2') THEN
    IF NEW.month IS NULL THEN RAISE EXCEPTION 'month is required for term_1/term_2'; END IF;
  ELSE
    IF NEW.month IS NOT NULL THEN RAISE EXCEPTION 'month must be null for midyear/final'; END IF;
  END IF;
  SELECT max_score INTO s_max FROM public.subjects WHERE id = NEW.subject_id;
  IF s_max IS NULL THEN RAISE EXCEPTION 'Subject has no max_score set; admin must configure it before grading'; END IF;
  IF NEW.score < 0 OR NEW.score > s_max THEN RAISE EXCEPTION 'Score % is outside allowed range 0..%', NEW.score, s_max; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS grades_validate_biu ON public.grades;
CREATE TRIGGER grades_validate_biu BEFORE INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION public.grades_validate();

CREATE TABLE IF NOT EXISTS public.term_month_settings (
  term public.term_type PRIMARY KEY,
  months smallint[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (array_length(months, 1) >= 1));
GRANT SELECT ON public.term_month_settings TO authenticated;
GRANT ALL ON public.term_month_settings TO service_role;
ALTER TABLE public.term_month_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tms_read" ON public.term_month_settings;
CREATE POLICY "tms_read" ON public.term_month_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tms_admin_write" ON public.term_month_settings;
CREATE POLICY "tms_admin_write" ON public.term_month_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.term_month_settings (term, months) VALUES
  ('term_1', ARRAY[10, 11]::smallint[]),
  ('term_2', ARRAY[2, 3]::smallint[])
ON CONFLICT (term) DO NOTHING;
