
-- Path convention: <teacher_assignment_id>/<filename>
CREATE POLICY "hw_files_teacher_manage" ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'homework-files'
  AND public.teacher_owns_assignment(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'homework-files'
  AND public.teacher_owns_assignment(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
);

CREATE POLICY "hw_files_student_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'homework-files'
  AND EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    JOIN public.subjects s ON s.id = ta.subject_id
    JOIN public.student_enrollments se ON se.user_id = auth.uid()
    WHERE ta.id = ((string_to_array(name, '/'))[1])::uuid
      AND s.stage_group = se.stage_group
      AND s.grade_level = se.grade_level
  )
);

CREATE POLICY "hw_files_admin_all" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'homework-files' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'homework-files' AND public.has_role(auth.uid(), 'admin'));
