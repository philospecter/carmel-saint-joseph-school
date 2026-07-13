
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_stage_manager_of(UUID, stage_group) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_owns_assignment(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_stage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subject_stage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_of_stage_manager(UUID, UUID) TO authenticated;
