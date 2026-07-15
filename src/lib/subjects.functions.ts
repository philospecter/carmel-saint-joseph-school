import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAGE_GROUPS = ["primary_1_2", "primary_3_6", "preparatory", "secondary"] as const;
type StageGroup = (typeof STAGE_GROUPS)[number];
const GRADES_BY_STAGE: Record<StageGroup, string[]> = {
  primary_1_2: ["p1", "p2"],
  primary_3_6: ["p3", "p4", "p5", "p6"],
  preparatory: ["prep1", "prep2", "prep3"],
  secondary: ["sec1", "sec2", "sec3"],
};

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listSubjectsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const supabase = context.supabase as any;
    const { data: subjects, error } = await supabase
      .from("subjects")
      .select("id, name, stage_group, grade_level")
      .order("stage_group")
      .order("grade_level")
      .order("name");
    if (error) throw new Error(error.message);
    const rows = (subjects ?? []) as Array<{ id: string; name: string; stage_group: string; grade_level: string }>;
    const ids = rows.map((r) => r.id);

    const counts = new Map<string, { teachers: number; homework: number; grades: number }>();
    for (const id of ids) counts.set(id, { teachers: 0, homework: 0, grades: 0 });

    if (ids.length > 0) {
      const [ta, hw, gr] = await Promise.all([
        supabase.from("teacher_assignments").select("subject_id").in("subject_id", ids),
        supabase.from("homework").select("teacher_assignment_id, teacher_assignments!inner(subject_id)").in("teacher_assignments.subject_id", ids),
        supabase.from("grades").select("subject_id").in("subject_id", ids),
      ]);
      if (ta.error) throw new Error(ta.error.message);
      if (gr.error) throw new Error(gr.error.message);
      for (const r of ta.data ?? []) {
        const c = counts.get(r.subject_id); if (c) c.teachers++;
      }
      for (const r of gr.data ?? []) {
        const c = counts.get(r.subject_id); if (c) c.grades++;
      }
      if (!hw.error) {
        for (const r of (hw.data ?? []) as any[]) {
          const sid = r.teacher_assignments?.subject_id;
          const c = sid ? counts.get(sid) : undefined; if (c) c.homework++;
        }
      }
    }

    return rows.map((s) => ({ ...s, ref_counts: counts.get(s.id)! }));
  });



export const createSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; stage_group: StageGroup; grade_levels: string[] }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const name = data.name.trim();
    if (!name) throw new Error("Name is required.");
    if (!STAGE_GROUPS.includes(data.stage_group)) throw new Error("Invalid stage.");
    const allowed = new Set(GRADES_BY_STAGE[data.stage_group]);
    const grades = Array.from(new Set(data.grade_levels));
    if (grades.length === 0) throw new Error("Select at least one grade.");
    for (const g of grades) if (!allowed.has(g)) throw new Error(`Grade ${g} does not belong to ${data.stage_group}.`);

    // Determine which already exist
    const { data: existing, error: exErr } = await context.supabase
      .from("subjects")
      .select("grade_level")
      .eq("stage_group", data.stage_group as never)
      .eq("name", name)
      .in("grade_level", grades as never);
    if (exErr) throw new Error(exErr.message);
    const existingSet = new Set((existing ?? []).map((r) => r.grade_level as string));
    const toInsert = grades.filter((g) => !existingSet.has(g));

    // Compute deterministic ids via RPC
    const rows = await Promise.all(
      toInsert.map(async (g) => {
        const { data: idData, error: idErr } = await (context.supabase as any).rpc("subject_uuid" as never, {
          _stage: data.stage_group,
          _grade: g,
          _name: name,
        });
        if (idErr) throw new Error(idErr.message);
        return { id: idData as unknown as string, name, stage_group: data.stage_group, grade_level: g };
      }),
    );

    let created = 0;
    if (rows.length > 0) {
      const { error: insErr } = await context.supabase.from("subjects").insert(rows as never);
      if (insErr) throw new Error(insErr.message);
      created = rows.length;
    }
    return { created, skipped: Array.from(existingSet) };
  });

export const renameSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const name = data.name.trim();
    if (!name) throw new Error("Name is required.");
    const { error } = await context.supabase.from("subjects").update({ name } as never).eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error("A subject with that name already exists for this grade.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const patch: Record<string, unknown> = {};
    if (typeof data.name === "string") {
      const n = data.name.trim();
      if (!n) throw new Error("Name is required.");
      patch.name = n;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await (context.supabase as any).from("subjects").update(patch).eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error("A subject with that name already exists for this grade.");
      throw new Error(error.message);
    }
    return { ok: true };
  });



export const deleteSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data: countsData, error: cErr } = await (context.supabase as any).rpc("subject_reference_counts" as never, { _subject: data.id });
    if (cErr) throw new Error(cErr.message);
    const r = Array.isArray(countsData) ? countsData[0] : countsData;
    const teachers = Number(r?.teachers ?? 0);
    const homework = Number(r?.homework ?? 0);
    const grades = Number(r?.grades ?? 0);
    if (teachers + homework + grades > 0) {
      const err = new Error(
        `Cannot delete — ${teachers} teacher assignments, ${homework} homework items, ${grades} grades reference this subject.`,
      );
      (err as unknown as { code: string; teachers: number; homework: number; grades: number }).code = "HAS_REFERENCES";
      (err as unknown as { teachers: number }).teachers = teachers;
      (err as unknown as { homework: number }).homework = homework;
      (err as unknown as { grades: number }).grades = grades;
      throw err;
    }
    const { error } = await context.supabase.from("subjects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
