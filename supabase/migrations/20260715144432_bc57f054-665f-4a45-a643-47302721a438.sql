
DROP POLICY IF EXISTS year_restrict ON public.grades;
CREATE POLICY year_restrict_insert ON public.grades AS RESTRICTIVE
  FOR INSERT WITH CHECK (academic_year_id = public.current_academic_year_id());
CREATE POLICY year_restrict_update ON public.grades AS RESTRICTIVE
  FOR UPDATE USING (academic_year_id = public.current_academic_year_id())
  WITH CHECK (academic_year_id = public.current_academic_year_id());
CREATE POLICY year_restrict_delete ON public.grades AS RESTRICTIVE
  FOR DELETE USING (academic_year_id = public.current_academic_year_id());

DROP POLICY IF EXISTS year_restrict ON public.attendance;
CREATE POLICY year_restrict_insert ON public.attendance AS RESTRICTIVE
  FOR INSERT WITH CHECK (academic_year_id = public.current_academic_year_id());
CREATE POLICY year_restrict_update ON public.attendance AS RESTRICTIVE
  FOR UPDATE USING (academic_year_id = public.current_academic_year_id())
  WITH CHECK (academic_year_id = public.current_academic_year_id());
CREATE POLICY year_restrict_delete ON public.attendance AS RESTRICTIVE
  FOR DELETE USING (academic_year_id = public.current_academic_year_id());
