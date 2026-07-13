
ALTER TABLE public.signup_requests
  ADD CONSTRAINT signup_requests_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.student_enrollments
  ADD CONSTRAINT student_enrollments_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.teacher_assignments
  ADD CONSTRAINT teacher_assignments_teacher_id_profiles_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.stage_manager_assignments
  ADD CONSTRAINT stage_manager_assignments_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
