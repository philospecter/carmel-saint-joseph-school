
-- 1) Add approval columns
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS grades_pending_idx ON public.grades (subject_id, academic_year_id) WHERE approved_at IS NULL;

-- 2) Backfill: existing grades are considered approved (avoids hiding data students already saw)
UPDATE public.grades SET approved_at = COALESCE(approved_at, committed_at) WHERE approved_at IS NULL;

-- 3) Replace student SELECT policy to require approval
DROP POLICY IF EXISTS "Student can read own grades" ON public.grades;
CREATE POLICY "Student can read own approved grades"
  ON public.grades FOR SELECT TO authenticated
  USING (auth.uid() = student_id AND approved_at IS NOT NULL);

-- 4) Add teacher write policy (teacher must own an assignment matching subject + year)
DROP POLICY IF EXISTS "Teacher manages own subject grades" ON public.grades;
CREATE POLICY "Teacher manages own subject grades"
  ON public.grades FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = auth.uid()
      AND ta.subject_id = public.grades.subject_id
      AND ta.academic_year_id = public.grades.academic_year_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = auth.uid()
      AND ta.subject_id = public.grades.subject_id
      AND ta.academic_year_id = public.grades.academic_year_id
  ));

-- 5) Trigger to auto-approve when writer is admin/stage_manager, reset to pending when writer is a teacher
CREATE OR REPLACE FUNCTION public.grades_apply_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  writer uuid := auth.uid();
  s_stage stage_group;
BEGIN
  IF writer IS NULL THEN
    -- system/service role; leave as provided
    RETURN NEW;
  END IF;

  s_stage := public.subject_stage(NEW.subject_id);

  IF public.has_role(writer, 'admin') OR public.is_stage_manager_of(writer, s_stage) THEN
    -- Auto-approve on admin / stage manager writes
    IF NEW.approved_at IS NULL THEN
      NEW.approved_at := now();
      NEW.approved_by := writer;
    END IF;
  ELSE
    -- Teacher (or other) writes are pending until an admin approves
    IF TG_OP = 'UPDATE' THEN
      -- If the score/max changed, drop the previous approval
      IF NEW.score IS DISTINCT FROM OLD.score OR NEW.max_score IS DISTINCT FROM OLD.max_score THEN
        NEW.approved_at := NULL;
        NEW.approved_by := NULL;
      END IF;
    ELSE
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS grades_apply_approval_biu ON public.grades;
CREATE TRIGGER grades_apply_approval_biu
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.grades_apply_approval();

-- 6) RPC for bulk approval by admins
CREATE OR REPLACE FUNCTION public.approve_grades(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE caller uuid := auth.uid(); affected int;
BEGIN
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve grades';
  END IF;
  UPDATE public.grades
     SET approved_at = now(), approved_by = caller
   WHERE id = ANY(_ids) AND approved_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

GRANT EXECUTE ON FUNCTION public.approve_grades(uuid[]) TO authenticated;
