import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TermMonths = { term_1: number[]; term_2: number[] };

export const listTermMonths = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TermMonths> => {
    const { data, error } = await (context.supabase as any)
      .from("term_month_settings")
      .select("term, months");
    if (error) throw new Error(error.message);
    const out: TermMonths = { term_1: [10, 11], term_2: [2, 3] };
    for (const row of data ?? []) {
      if (row.term === "term_1" || row.term === "term_2") {
        const arr = (row.months as number[]).slice().sort((a, b) => a - b);
        out[row.term as "term_1" | "term_2"] = arr;
      }
    }
    return out;
  });

export const setTermMonths = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { term: "term_1" | "term_2"; months: number[] }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: rErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (rErr) throw new Error(rErr.message);
    if (!isAdmin) throw new Error("Forbidden");
    if (data.term !== "term_1" && data.term !== "term_2") throw new Error("Invalid term");
    const months = Array.from(new Set(data.months.map((m) => Number(m))));
    if (months.length === 0) throw new Error("At least one month is required.");
    for (const m of months) {
      if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error(`Invalid month: ${m}`);
    }
    months.sort((a, b) => a - b);
    const { error } = await (context.supabase as any)
      .from("term_month_settings")
      .upsert({ term: data.term, months, updated_at: new Date().toISOString() }, { onConflict: "term" });
    if (error) throw new Error(error.message);
    return { ok: true, months };
  });
