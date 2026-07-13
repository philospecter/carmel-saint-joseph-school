
CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'stage_manager', 'admin');
CREATE TYPE public.stage_group AS ENUM ('primary_1_2', 'primary_3_6', 'preparatory', 'secondary');
CREATE TYPE public.grade_level AS ENUM ('p1','p2','p3','p4','p5','p6','prep1','prep2','prep3','sec1','sec2','sec3');
CREATE TYPE public.request_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.question_type AS ENUM ('mcq','written');
CREATE TYPE public.attendance_status AS ENUM ('present','absent','late');
CREATE TYPE public.term_type AS ENUM ('term_1','term_2');
CREATE TYPE public.profile_status AS ENUM ('pending','active');
CREATE TYPE public.announcement_scope AS ENUM ('stage','subject');
CREATE TYPE public.homework_kind AS ENUM ('simple','bank');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, national_id TEXT UNIQUE, mobile TEXT, address TEXT, email TEXT,
  status profile_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL, UNIQUE (user_id, role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.stage_manager_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_group stage_group NOT NULL, UNIQUE (user_id, stage_group));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_manager_assignments TO authenticated;
GRANT ALL ON public.stage_manager_assignments TO service_role;
ALTER TABLE public.stage_manager_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_group stage_group NOT NULL, grade_level grade_level NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_enrollments TO authenticated;
GRANT ALL ON public.student_enrollments TO service_role;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, stage_group stage_group NOT NULL, grade_level grade_level NOT NULL,
  UNIQUE (name, stage_group, grade_level));
GRANT SELECT ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, subject_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_assignments TO authenticated;
GRANT ALL ON public.teacher_assignments TO service_role;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.signup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_group stage_group NOT NULL, grade_level grade_level NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id), reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_requests TO authenticated;
GRANT ALL ON public.signup_requests TO service_role;
ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope announcement_scope NOT NULL, stage_group stage_group,
  teacher_assignment_id UUID REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope='stage' AND stage_group IS NOT NULL AND teacher_assignment_id IS NULL)
      OR (scope='subject' AND teacher_assignment_id IS NOT NULL AND stage_group IS NULL)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.question_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_banks TO authenticated;
GRANT ALL ON public.question_banks TO service_role;
ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
  type question_type NOT NULL, prompt TEXT NOT NULL, choices JSONB,
  correct_choice INTEGER, points INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_assignment_id UUID NOT NULL REFERENCES public.teacher_assignments(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT, attachment_path TEXT,
  kind homework_kind NOT NULL DEFAULT 'simple',
  bank_id UUID REFERENCES public.question_banks(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ, auto_lock BOOLEAN NOT NULL DEFAULT true,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework TO authenticated;
GRANT ALL ON public.homework TO service_role;
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.homework_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0, UNIQUE (homework_id, question_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_questions TO authenticated;
GRANT ALL ON public.homework_questions TO service_role;
ALTER TABLE public.homework_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ, auto_score NUMERIC DEFAULT 0, manual_score NUMERIC DEFAULT 0,
  final_score NUMERIC DEFAULT 0, locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (homework_id, student_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_submissions TO authenticated;
GRANT ALL ON public.homework_submissions TO service_role;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.homework_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.homework_submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  mcq_choice INTEGER, written_text TEXT, is_correct BOOLEAN, manual_score NUMERIC,
  UNIQUE (submission_id, question_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_answers TO authenticated;
GRANT ALL ON public.homework_answers TO service_role;
ALTER TABLE public.homework_answers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL, status attendance_status NOT NULL,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (student_id, date));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  term term_type NOT NULL, score NUMERIC NOT NULL,
  entered_by UUID REFERENCES auth.users(id),
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, term));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grades TO authenticated;
GRANT ALL ON public.grades TO service_role;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
CREATE OR REPLACE FUNCTION public.is_stage_manager_of(_user_id UUID, _stage stage_group)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.stage_manager_assignments WHERE user_id = _user_id AND stage_group = _stage);
$$;
CREATE OR REPLACE FUNCTION public.teacher_owns_assignment(_user_id UUID, _assignment UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.teacher_assignments WHERE id = _assignment AND teacher_id = _user_id);
$$;
CREATE OR REPLACE FUNCTION public.student_stage(_user_id UUID)
RETURNS stage_group LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT stage_group FROM public.student_enrollments WHERE user_id = _user_id LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.subject_stage(_subject UUID)
RETURNS stage_group LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT stage_group FROM public.subjects WHERE id = _subject LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.student_of_stage_manager(_student UUID, _sm UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_enrollments se
    JOIN public.stage_manager_assignments sma ON sma.stage_group = se.stage_group
    WHERE se.user_id = _student AND sma.user_id = _sm);
$$;

CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id AND status = 'pending');
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'stage_manager'));
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_staff_select" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'stage_manager') OR public.has_role(auth.uid(),'teacher'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'stage_manager'));

CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'stage_manager'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "sma_select" ON public.stage_manager_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "sma_admin_manage" ON public.stage_manager_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "enrollments_self_select" ON public.student_enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "enrollments_staff_select" ON public.student_enrollments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), stage_group) OR public.has_role(auth.uid(),'teacher'));
CREATE POLICY "enrollments_admin_manage" ON public.student_enrollments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), stage_group)) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), stage_group));

CREATE POLICY "subjects_all_read" ON public.subjects FOR SELECT TO authenticated USING (true);

CREATE POLICY "ta_self_select" ON public.teacher_assignments FOR SELECT TO authenticated USING (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), public.subject_stage(subject_id)) OR public.has_role(auth.uid(),'student'));
CREATE POLICY "ta_manage" ON public.teacher_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), public.subject_stage(subject_id))) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), public.subject_stage(subject_id)));

CREATE POLICY "signup_self_insert" ON public.signup_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "signup_self_select" ON public.signup_requests FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), stage_group));
CREATE POLICY "signup_review_update" ON public.signup_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), stage_group)) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), stage_group));

CREATE POLICY "ann_stage_read_students" ON public.announcements FOR SELECT TO authenticated USING (scope='stage' AND stage_group = public.student_stage(auth.uid()));
CREATE POLICY "ann_subject_read_students" ON public.announcements FOR SELECT TO authenticated USING (scope='subject' AND EXISTS (SELECT 1 FROM public.teacher_assignments ta JOIN public.subjects s ON s.id=ta.subject_id JOIN public.student_enrollments se ON se.user_id=auth.uid() WHERE ta.id=teacher_assignment_id AND s.stage_group=se.stage_group AND s.grade_level=se.grade_level));
CREATE POLICY "ann_teacher_read" ON public.announcements FOR SELECT TO authenticated USING (scope='subject' AND public.teacher_owns_assignment(auth.uid(), teacher_assignment_id));
CREATE POLICY "ann_staff_read" ON public.announcements FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR (scope='stage' AND public.is_stage_manager_of(auth.uid(), stage_group)));
CREATE POLICY "ann_stage_insert" ON public.announcements FOR INSERT TO authenticated WITH CHECK (scope='stage' AND (public.has_role(auth.uid(),'admin') OR public.is_stage_manager_of(auth.uid(), stage_group)) AND author_id = auth.uid());
CREATE POLICY "ann_subject_insert" ON public.announcements FOR INSERT TO authenticated WITH CHECK (scope='subject' AND public.teacher_owns_assignment(auth.uid(), teacher_assignment_id) AND author_id = auth.uid());
CREATE POLICY "ann_delete_own" ON public.announcements FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "qb_owner" ON public.question_banks FOR ALL TO authenticated USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "q_owner" ON public.questions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.question_banks qb WHERE qb.id=bank_id AND (qb.teacher_id=auth.uid() OR public.has_role(auth.uid(),'admin')))) WITH CHECK (EXISTS (SELECT 1 FROM public.question_banks qb WHERE qb.id=bank_id AND qb.teacher_id=auth.uid()));

CREATE POLICY "hw_teacher_manage" ON public.homework FOR ALL TO authenticated USING (public.teacher_owns_assignment(auth.uid(), teacher_assignment_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.teacher_owns_assignment(auth.uid(), teacher_assignment_id));
CREATE POLICY "hw_student_read" ON public.homework FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.teacher_assignments ta JOIN public.subjects s ON s.id=ta.subject_id JOIN public.student_enrollments se ON se.user_id=auth.uid() WHERE ta.id=teacher_assignment_id AND s.stage_group=se.stage_group AND s.grade_level=se.grade_level));
CREATE POLICY "hw_sm_read" ON public.homework FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.teacher_assignments ta JOIN public.subjects s ON s.id=ta.subject_id WHERE ta.id=teacher_assignment_id AND public.is_stage_manager_of(auth.uid(), s.stage_group)));

CREATE POLICY "hwq_read" ON public.homework_questions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.homework h JOIN public.teacher_assignments ta ON ta.id=h.teacher_assignment_id JOIN public.subjects s ON s.id=ta.subject_id LEFT JOIN public.student_enrollments se ON se.user_id=auth.uid() WHERE h.id=homework_id AND (ta.teacher_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR (se.stage_group=s.stage_group AND se.grade_level=s.grade_level))));
CREATE POLICY "hwq_teacher_manage" ON public.homework_questions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.homework h WHERE h.id=homework_id AND public.teacher_owns_assignment(auth.uid(), h.teacher_assignment_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.homework h WHERE h.id=homework_id AND public.teacher_owns_assignment(auth.uid(), h.teacher_assignment_id)));

CREATE POLICY "sub_student_own" ON public.homework_submissions FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "sub_student_insert" ON public.homework_submissions FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() AND locked=false);
CREATE POLICY "sub_student_update" ON public.homework_submissions FOR UPDATE TO authenticated USING (student_id = auth.uid() AND locked=false) WITH CHECK (student_id = auth.uid());
CREATE POLICY "sub_teacher_read" ON public.homework_submissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.homework h WHERE h.id=homework_id AND public.teacher_owns_assignment(auth.uid(), h.teacher_assignment_id)));
CREATE POLICY "sub_teacher_update" ON public.homework_submissions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.homework h WHERE h.id=homework_id AND public.teacher_owns_assignment(auth.uid(), h.teacher_assignment_id)));

CREATE POLICY "ans_student_own" ON public.homework_answers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.homework_submissions sub WHERE sub.id=submission_id AND sub.student_id=auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.homework_submissions sub WHERE sub.id=submission_id AND sub.student_id=auth.uid() AND sub.locked=false));
CREATE POLICY "ans_teacher_read" ON public.homework_answers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.homework_submissions sub JOIN public.homework h ON h.id=sub.homework_id WHERE sub.id=submission_id AND public.teacher_owns_assignment(auth.uid(), h.teacher_assignment_id)));
CREATE POLICY "ans_teacher_update" ON public.homework_answers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.homework_submissions sub JOIN public.homework h ON h.id=sub.homework_id WHERE sub.id=submission_id AND public.teacher_owns_assignment(auth.uid(), h.teacher_assignment_id)));

CREATE POLICY "att_student_own" ON public.attendance FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "att_staff_manage" ON public.attendance FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.student_of_stage_manager(student_id, auth.uid())) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.student_of_stage_manager(student_id, auth.uid()));

CREATE POLICY "grades_student_own" ON public.grades FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "grades_staff_manage" ON public.grades FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.student_of_stage_manager(student_id, auth.uid())) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.student_of_stage_manager(student_id, auth.uid()));

INSERT INTO public.subjects (name, stage_group, grade_level) VALUES
 ('Arabic','primary_1_2','p1'),('Maths','primary_1_2','p1'),('Religion','primary_1_2','p1'),('French','primary_1_2','p1'),('English','primary_1_2','p1'),
 ('Arabic','primary_1_2','p2'),('Maths','primary_1_2','p2'),('Religion','primary_1_2','p2'),('French','primary_1_2','p2'),('English','primary_1_2','p2');
INSERT INTO public.subjects (name, stage_group, grade_level)
SELECT name, 'primary_3_6'::stage_group, g::grade_level
FROM (VALUES ('Arabic'),('Maths'),('Religion'),('French'),('English')) AS s(name),
     (VALUES ('p3'),('p4'),('p5'),('p6')) AS g_t(g);
INSERT INTO public.subjects (name, stage_group, grade_level)
SELECT name, 'preparatory'::stage_group, g::grade_level
FROM (VALUES ('Arabic'),('Maths'),('Religion'),('French'),('English'),('Science'),('Social Studies')) AS s(name),
     (VALUES ('prep1'),('prep2'),('prep3')) AS g_t(g);
INSERT INTO public.subjects (name, stage_group, grade_level)
SELECT name, 'secondary'::stage_group, g::grade_level
FROM (VALUES ('Arabic'),('Maths'),('Religion'),('French'),('English'),('History'),('Geography'),('Philosophy'),('Integrated Science'),('Chemistry'),('Physics'),('Biology')) AS s(name),
     (VALUES ('sec1'),('sec2'),('sec3')) AS g_t(g);

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_stage_manager_of(UUID, stage_group) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teacher_owns_assignment(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_stage(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.subject_stage(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_of_stage_manager(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_stage_manager_of(UUID, stage_group) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_owns_assignment(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_stage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subject_stage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_of_stage_manager(UUID, UUID) TO authenticated;

CREATE POLICY "hw_files_teacher_manage" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'homework-files' AND public.teacher_owns_assignment(auth.uid(), ((string_to_array(name, '/'))[1])::uuid))
WITH CHECK (bucket_id = 'homework-files' AND public.teacher_owns_assignment(auth.uid(), ((string_to_array(name, '/'))[1])::uuid));
CREATE POLICY "hw_files_student_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'homework-files' AND EXISTS (SELECT 1 FROM public.teacher_assignments ta JOIN public.subjects s ON s.id=ta.subject_id JOIN public.student_enrollments se ON se.user_id=auth.uid() WHERE ta.id=((string_to_array(name,'/'))[1])::uuid AND s.stage_group=se.stage_group AND s.grade_level=se.grade_level));
CREATE POLICY "hw_files_admin_all" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'homework-files' AND public.has_role(auth.uid(),'admin'))
WITH CHECK (bucket_id = 'homework-files' AND public.has_role(auth.uid(),'admin'));
