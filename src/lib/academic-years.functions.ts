import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AcademicYear = {
  id: string;
  label: string;
  is_current: boolean;
  started_at: string;
  closed_at: string | null;
};

export const listAcademicYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AcademicYear[]> => {
    const { data, error } = await (context.supabase as any)
      .from("academic_years")
      .select("id, label, is_current, started_at, closed_at")
      .order("started_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCurrentAcademicYear = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AcademicYear | null> => {
    const { data, error } = await (context.supabase as any)
      .from("academic_years")
      .select("id, label, is_current, started_at, closed_at")
      .eq("is_current", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const startNewAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { label: string }) => input)
  .handler(async ({ data, context }): Promise<{ new_year_id: string }> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as never });
    if (!isAdmin) throw new Error("Forbidden");
    const label = data.label.trim();
    if (!label) throw new Error("Label is required");
    const { data: newId, error } = await (supabase as any).rpc("start_new_academic_year", { _label: label });
    if (error) throw new Error(error.message);
    return { new_year_id: newId as string };
  });

export type PromotionRosterEntry = {
  stage_group: string;
  grade_level: string;
  students: { user_id: string; full_name: string }[];
};

export const previewPromotion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PromotionRosterEntry[]> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as never });
    if (!isAdmin) throw new Error("Forbidden");

    // Uses SECURITY DEFINER RPC to see the most recently closed year (past-year
    // rows are hidden by the restrictive year_restrict RLS policy).
    const { data: rows, error } = await (supabase as any).rpc("preview_promotion_roster");
    if (error) throw new Error(error.message);

    const grouped = new Map<string, PromotionRosterEntry>();
    for (const r of (rows ?? []) as Array<{
      user_id: string;
      stage_group: string;
      grade_level: string;
      full_name: string;
    }>) {
      const key = `${r.stage_group}|${r.grade_level}`;
      if (!grouped.has(key)) {
        grouped.set(key, { stage_group: r.stage_group, grade_level: r.grade_level, students: [] });
      }
      grouped.get(key)!.students.push({ user_id: r.user_id, full_name: r.full_name ?? "—" });
    }
    return Array.from(grouped.values());
  });

export const pendingPromotionCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin" as never,
    });
    if (!isAdmin) return 0;
    const { data, error } = await (context.supabase as any).rpc("pending_promotion_count");
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  });

export type YearScopedCounts = {
  enrollments: number;
  grades: number;
  attendance: number;
  teacher_assignments: number;
  homework: number;
  announcements: number;
};

export const getYearCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { year_id: string }) => input)
  .handler(async ({ data, context }): Promise<YearScopedCounts> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: row, error } = await (context.supabase as any).rpc("year_scoped_counts", { _year: data.year_id });
    if (error) throw new Error(error.message);
    return row as YearScopedCounts;
  });



export const promoteStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      promotions: { from_stage: string; from_grade: string; to_stage: string; to_grade: string }[];
      repeats: string[];
    }) => input,
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as never });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await (supabase as any).rpc("promote_students", {
      _promotions: data.promotions,
      _repeats: data.repeats,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
