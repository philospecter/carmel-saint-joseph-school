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

    // Old year = the most-recently closed year
    const { data: oldYear } = await (supabase as any)
      .from("academic_years")
      .select("id")
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!oldYear) return [];

    const { data: rows, error } = await (supabase as any)
      .from("student_enrollments")
      .select("user_id, stage_group, grade_level, profiles:user_id(full_name)")
      .eq("academic_year_id", oldYear.id)
      .eq("is_graduated", false);
    if (error) throw new Error(error.message);

    const grouped = new Map<string, PromotionRosterEntry>();
    for (const r of (rows ?? []) as Array<{
      user_id: string;
      stage_group: string;
      grade_level: string;
      profiles: { full_name: string } | null;
    }>) {
      const key = `${r.stage_group}|${r.grade_level}`;
      if (!grouped.has(key)) {
        grouped.set(key, { stage_group: r.stage_group, grade_level: r.grade_level, students: [] });
      }
      grouped.get(key)!.students.push({ user_id: r.user_id, full_name: r.profiles?.full_name ?? "—" });
    }
    return Array.from(grouped.values());
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
