DROP POLICY IF EXISTS year_restrict ON public.student_enrollments;
CREATE POLICY year_restrict_write ON public.student_enrollments
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (academic_year_id = public.current_academic_year_id());
CREATE POLICY year_restrict_update ON public.student_enrollments
  AS RESTRICTIVE
  FOR UPDATE
  USING (academic_year_id = public.current_academic_year_id())
  WITH CHECK (academic_year_id = public.current_academic_year_id());
CREATE POLICY year_restrict_delete ON public.student_enrollments
  AS RESTRICTIVE
  FOR DELETE
  USING (academic_year_id = public.current_academic_year_id());