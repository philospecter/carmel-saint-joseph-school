
REVOKE ALL ON FUNCTION public.current_academic_year_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_academic_year_id() TO authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM public, anon;
REVOKE ALL ON FUNCTION public.start_new_academic_year(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_new_academic_year(text) TO authenticated;
REVOKE ALL ON FUNCTION public.promote_students(jsonb, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.promote_students(jsonb, uuid[]) TO authenticated;
