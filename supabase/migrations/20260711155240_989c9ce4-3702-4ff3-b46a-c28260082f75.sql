
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_stage_manager_of(UUID, stage_group) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teacher_owns_assignment(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_stage(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.subject_stage(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_of_stage_manager(UUID, UUID) FROM PUBLIC, anon;
