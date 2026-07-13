import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GradeCellRow = {
  id: string;
  student_id: string;
  subject_id: string;
  term: "term_1" | "term_2" | "midyear" | "final";
  month: number | null;
  score: number;
  max_score: number;
  entered_by: string | null;
  committed_at: string;
  updated_at: string;
  entered_by_name: string | null;
};

/**
 * Fetches grades for a (subject, term, month|null) cell, joined with the
 * profile name of whoever last entered/edited the grade.
 */
export const listGradesForCell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subject_id: string; term: string; month: number | null; year_id?: string | null }) => input)
  .handler(async ({ data, context }): Promise<GradeCellRow[]> => {
    let q = (context.supabase as any)
      .from("grades")
      .select("id, student_id, subject_id, term, month, score, max_score, entered_by, committed_at, updated_at")
      .eq("subject_id", data.subject_id)
      .eq("term", data.term);
    if (data.month === null) q = q.is("month", null);
    else q = q.eq("month", data.month);
    if (data.year_id) q = q.eq("academic_year_id", data.year_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const grades = (rows ?? []) as Array<Omit<GradeCellRow, "entered_by_name">>;
    const editorIds = Array.from(new Set(grades.map((g) => g.entered_by).filter((x): x is string => !!x)));
    let names = new Map<string, string>();
    if (editorIds.length > 0) {
      const { data: profs, error: pErr } = await (context.supabase as any)
        .from("profiles")
        .select("id, full_name")
        .in("id", editorIds);
      if (pErr) throw new Error(pErr.message);
      names = new Map((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
    }
    return grades.map((g) => ({ ...g, entered_by_name: g.entered_by ? names.get(g.entered_by) ?? null : null }));
  });

export const getGradeCellMax = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subject_id: string; term: string; month: number | null; year_id?: string | null }) => input)
  .handler(async ({ data, context }): Promise<{ max_score: number | null; row_count: number }> => {
    let q = (context.supabase as any)
      .from("grades")
      .select("max_score")
      .eq("subject_id", data.subject_id)
      .eq("term", data.term);
    if (data.month === null) q = q.is("month", null);
    else q = q.eq("month", data.month);
    if (data.year_id) q = q.eq("academic_year_id", data.year_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const arr = (rows ?? []) as Array<{ max_score: number }>;
    if (arr.length === 0) return { max_score: null, row_count: 0 };
    return { max_score: Number(arr[0].max_score), row_count: arr.length };
  });

/**
 * Rescales every existing grade row in a (subject, term, month, current year) cell
 * to a new max_score. Authorized via the SECURITY DEFINER RPC (admin, stage manager
 * of the subject's stage, or teacher assigned to the subject).
 */
export const setGradeCellMax = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { subject_id: string; term: string; month: number | null; new_max: number }) => input,
  )
  .handler(async ({ data, context }): Promise<{ affected: number }> => {
    const { data: affected, error } = await (context.supabase as any).rpc("set_grade_cell_max", {
      _subject: data.subject_id,
      _term: data.term,
      _month: data.month,
      _new_max: data.new_max,
    });
    if (error) throw new Error(error.message);
    return { affected: Number(affected ?? 0) };
  });

/**
 * Deletes every grade row in a (subject, term, month, current year) cell.
 * Used when a staff user changes the max score after data has been entered:
 * the previous scores are cleared so a new max can be set from scratch.
 */
export const clearGradeCell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subject_id: string; term: string; month: number | null }) => input)
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    let q = (context.supabase as any)
      .from("grades")
      .delete({ count: "exact" })
      .eq("subject_id", data.subject_id)
      .eq("term", data.term);
    if (data.month === null) q = q.is("month", null);
    else q = q.eq("month", data.month);
    const { error, count } = await q;
    if (error) throw new Error(error.message);
    return { deleted: Number(count ?? 0) };
  });
