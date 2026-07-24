import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TeacherActivity = {
  assignments: Array<{
    id: string;
    subject_id: string;
    subject_name: string;
    stage_group: string;
    grade_level: string;
    homework_count: number;
    grades_entered: number;
    grades_pending: number;
  }>;
  homework: Array<{
    id: string;
    title: string;
    kind: string;
    created_at: string;
    due_at: string | null;
    locked: boolean;
    subject_name: string;
    stage_group: string;
    grade_level: string;
    submission_count: number;
  }>;
};

export const getTeacherActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { teacher_id: string; year_id?: string | null }) => input)
  .handler(async ({ data, context }): Promise<TeacherActivity> => {
    const sb = context.supabase as any;
    let yearId = data.year_id ?? null;
    if (!yearId) {
      const { data: y } = await sb.rpc("current_academic_year_id");
      yearId = y;
    }

    const { data: asgRows, error: asgErr } = await sb
      .from("teacher_assignments")
      .select("id, subject_id, subjects(id, name, stage_group, grade_level)")
      .eq("teacher_id", data.teacher_id)
      .eq("academic_year_id", yearId);
    if (asgErr) throw new Error(asgErr.message);

    const assignments = (asgRows ?? []) as Array<{
      id: string;
      subject_id: string;
      subjects: { id: string; name: string; stage_group: string; grade_level: string } | null;
    }>;

    const subjectIds = assignments.map((a) => a.subject_id);
    const assignmentIds = assignments.map((a) => a.id);

    // Homework by teacher assignments in year
    let hwRows: any[] = [];
    if (assignmentIds.length > 0) {
      const { data: hw, error: hwErr } = await sb
        .from("homework")
        .select("id, title, kind, created_at, due_at, locked, teacher_assignment_id")
        .in("teacher_assignment_id", assignmentIds)
        .eq("academic_year_id", yearId)
        .order("created_at", { ascending: false });
      if (hwErr) throw new Error(hwErr.message);
      hwRows = hw ?? [];
    }

    // Submission counts per homework
    const subCountByHw = new Map<string, number>();
    if (hwRows.length > 0) {
      const hwIds = hwRows.map((h) => h.id);
      const { data: subs, error: sErr } = await sb
        .from("homework_submissions")
        .select("homework_id")
        .in("homework_id", hwIds);
      if (sErr) throw new Error(sErr.message);
      for (const s of (subs ?? []) as Array<{ homework_id: string }>) {
        subCountByHw.set(s.homework_id, (subCountByHw.get(s.homework_id) ?? 0) + 1);
      }
    }

    // Grades per subject (entered by this teacher in year)
    const gradesBySubject = new Map<string, { entered: number; pending: number }>();
    if (subjectIds.length > 0) {
      const { data: gRows, error: gErr } = await sb
        .from("grades")
        .select("subject_id, approved_at")
        .in("subject_id", subjectIds)
        .eq("entered_by", data.teacher_id)
        .eq("academic_year_id", yearId);
      if (gErr) throw new Error(gErr.message);
      for (const g of (gRows ?? []) as Array<{ subject_id: string; approved_at: string | null }>) {
        const cur = gradesBySubject.get(g.subject_id) ?? { entered: 0, pending: 0 };
        cur.entered += 1;
        if (!g.approved_at) cur.pending += 1;
        gradesBySubject.set(g.subject_id, cur);
      }
    }

    // Homework count per assignment
    const hwCountByAsg = new Map<string, number>();
    for (const h of hwRows) {
      hwCountByAsg.set(h.teacher_assignment_id, (hwCountByAsg.get(h.teacher_assignment_id) ?? 0) + 1);
    }

    const subjectById = new Map(
      assignments
        .filter((a) => a.subjects)
        .map((a) => [a.subject_id, a.subjects!] as const),
    );

    return {
      assignments: assignments
        .filter((a) => a.subjects)
        .map((a) => {
          const g = gradesBySubject.get(a.subject_id) ?? { entered: 0, pending: 0 };
          return {
            id: a.id,
            subject_id: a.subject_id,
            subject_name: a.subjects!.name,
            stage_group: a.subjects!.stage_group,
            grade_level: a.subjects!.grade_level,
            homework_count: hwCountByAsg.get(a.id) ?? 0,
            grades_entered: g.entered,
            grades_pending: g.pending,
          };
        }),
      homework: hwRows.map((h) => {
        const asg = assignments.find((a) => a.id === h.teacher_assignment_id);
        const s = asg ? subjectById.get(asg.subject_id) : null;
        return {
          id: h.id,
          title: h.title,
          kind: h.kind,
          created_at: h.created_at,
          due_at: h.due_at,
          locked: h.locked,
          subject_name: s?.name ?? "—",
          stage_group: s?.stage_group ?? "",
          grade_level: s?.grade_level ?? "",
          submission_count: subCountByHw.get(h.id) ?? 0,
        };
      }),
    };
  });