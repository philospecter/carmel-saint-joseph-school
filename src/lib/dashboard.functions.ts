import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DashboardStats = {
  is_admin: boolean;
  active_students: number;
  attendance_today: { taken: number; pending: number; groups: { stage_group: string; grade_level: string; taken: boolean }[] };
  pending_signups: number | null;
  recent_grades: {
    id: string;
    subject_name: string;
    student_name: string;
    score: number;
    max_score: number;
    entered_by_name: string | null;
    updated_at: string;
  }[];
  sessions_pending: { subject_id: string; subject_name: string; stage_group: string; grade_level: string }[];
};

export const getStaffDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardStats> => {
    const sb = context.supabase as any;
    const userId = context.userId;

    const { data: isAdminRaw } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
    const isAdmin = !!isAdminRaw;

    // Determine scope: admin sees all stages; SM sees their assigned stages.
    let scopeStages: string[] | null = null; // null = all
    if (!isAdmin) {
      const { data: sma } = await sb
        .from("stage_manager_assignments")
        .select("stage_group")
        .eq("user_id", userId);
      scopeStages = (sma ?? []).map((r: { stage_group: string }) => r.stage_group);
    }

    // Active students: current-year enrollments, not graduated. RLS scopes SM.
    let enrollQ = sb
      .from("student_enrollments")
      .select("user_id, stage_group, grade_level", { count: "exact" })
      .eq("is_graduated", false);
    if (scopeStages && scopeStages.length > 0) enrollQ = enrollQ.in("stage_group", scopeStages);
    const { data: enrolls, count: activeCount } = await enrollQ;
    const groups = new Map<string, { stage_group: string; grade_level: string }>();
    for (const e of (enrolls ?? []) as Array<{ stage_group: string; grade_level: string }>) {
      const key = `${e.stage_group}|${e.grade_level}`;
      if (!groups.has(key)) groups.set(key, { stage_group: e.stage_group, grade_level: e.grade_level });
    }

    // Attendance today per (stage,grade) in scope.
    const today = new Date().toISOString().slice(0, 10);
    const groupList = Array.from(groups.values());
    const attGroups = await Promise.all(
      groupList.map(async (g) => {
        const enrolledIds = ((enrolls ?? []) as Array<{ user_id: string; stage_group: string; grade_level: string }>)
          .filter((e) => e.stage_group === g.stage_group && e.grade_level === g.grade_level)
          .map((e) => e.user_id);
        if (enrolledIds.length === 0) return { ...g, taken: true };
        const { count } = await sb
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("date", today)
          .in("student_id", enrolledIds);
        return { ...g, taken: (count ?? 0) > 0 };
      }),
    );
    const taken = attGroups.filter((g) => g.taken).length;
    const pending = attGroups.length - taken;

    // Pending signups (admin only)
    let pendingSignups: number | null = null;
    if (isAdmin) {
      const { count } = await sb
        .from("signup_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      pendingSignups = count ?? 0;
    }

    // Recent grades activity (last 5) — scope by stage for SM via subject_stage.
    const { data: recentRaw } = await sb
      .from("grades")
      .select("id, subject_id, student_id, score, max_score, entered_by, updated_at")
      .order("updated_at", { ascending: false })
      .limit(15);
    const recent = (recentRaw ?? []) as Array<{
      id: string;
      subject_id: string;
      student_id: string;
      score: number;
      max_score: number;
      entered_by: string | null;
      updated_at: string;
    }>;
    const subjIds = Array.from(new Set(recent.map((r) => r.subject_id)));
    const studIds = Array.from(new Set(recent.map((r) => r.student_id)));
    const enteredIds = Array.from(new Set(recent.map((r) => r.entered_by).filter((x): x is string => !!x)));
    const [{ data: subjects }, { data: profs }] = await Promise.all([
      subjIds.length > 0
        ? sb.from("subjects").select("id, name, stage_group").in("id", subjIds)
        : Promise.resolve({ data: [] }),
      studIds.length + enteredIds.length > 0
        ? sb.from("profiles").select("id, full_name").in("id", Array.from(new Set([...studIds, ...enteredIds])))
        : Promise.resolve({ data: [] }),
    ]);
    const subjMap = new Map<string, { id: string; name: string; stage_group: string }>((subjects ?? []).map((s: any) => [s.id as string, s]));
    const profMap = new Map<string, string>((profs ?? []).map((p: any) => [p.id as string, p.full_name as string]));
    const scopedRecent = recent
      .filter((r) => {
        if (isAdmin) return true;
        const s = subjMap.get(r.subject_id) as { stage_group: string } | undefined;
        return s && scopeStages && scopeStages.includes(s.stage_group);
      })
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        subject_name: (subjMap.get(r.subject_id) as any)?.name ?? "—",
        student_name: profMap.get(r.student_id) ?? "—",
        score: Number(r.score),
        max_score: Number(r.max_score),
        entered_by_name: r.entered_by ? profMap.get(r.entered_by) ?? null : null,
        updated_at: r.updated_at,
      }));

    // Sessions pending: subjects with a teacher_assignment in current year but zero grade rows.
    const { data: assigns } = await sb
      .from("teacher_assignments")
      .select("subject_id, subjects!inner(id, name, stage_group, grade_level)");
    const assignSubjects = ((assigns ?? []) as Array<{ subject_id: string; subjects: any }>).map((a) => a.subjects);
    const scopedAssignSubjects = assignSubjects.filter(
      (s) => isAdmin || (scopeStages && scopeStages.includes(s.stage_group)),
    );
    const uniqueSubjects = Array.from(new Map(scopedAssignSubjects.map((s) => [s.id, s])).values());
    const sessionsPending = await Promise.all(
      uniqueSubjects.map(async (s) => {
        const { count } = await sb
          .from("grades")
          .select("id", { count: "exact", head: true })
          .eq("subject_id", s.id);
        return (count ?? 0) === 0
          ? { subject_id: s.id, subject_name: s.name, stage_group: s.stage_group, grade_level: s.grade_level }
          : null;
      }),
    );

    return {
      is_admin: isAdmin,
      active_students: activeCount ?? 0,
      attendance_today: { taken, pending, groups: attGroups },
      pending_signups: pendingSignups,
      recent_grades: scopedRecent,
      sessions_pending: sessionsPending.filter((x): x is NonNullable<typeof x> => x !== null),
    };
  });
