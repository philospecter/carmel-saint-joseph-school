CREATE POLICY q_student_read ON public.questions FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.homework_questions hq
    JOIN public.homework h ON h.id = hq.homework_id
    JOIN public.teacher_assignments ta ON ta.id = h.teacher_assignment_id
    JOIN public.subjects s ON s.id = ta.subject_id
    JOIN public.student_enrollments se ON se.user_id = auth.uid()
    WHERE hq.question_id = questions.id
      AND s.stage_group = se.stage_group
      AND s.grade_level = se.grade_level
  )
);

CREATE POLICY q_sm_read ON public.questions FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.homework_questions hq
    JOIN public.homework h ON h.id = hq.homework_id
    JOIN public.teacher_assignments ta ON ta.id = h.teacher_assignment_id
    JOIN public.subjects s ON s.id = ta.subject_id
    WHERE hq.question_id = questions.id
      AND public.is_stage_manager_of(auth.uid(), s.stage_group)
  )
);