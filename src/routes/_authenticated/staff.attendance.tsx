import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, STAGE_GROUPS, GRADES_BY_STAGE } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { useMe } from "@/hooks/use-me";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/staff/attendance")({
  validateSearch: (search: Record<string, unknown>): { year?: string } => ({
    year: typeof search.year === "string" && search.year ? search.year : undefined,
  }),
  component: Page,
});

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { year: yearId } = Route.useSearch();
  const readOnly = !!yearId;
  const isAdmin = !!me?.roles.includes("admin");
  const stages = isAdmin ? [...STAGE_GROUPS] : me?.stages ?? [];
  const [stage, setStage] = useState<string>(stages[0] ?? "primary_1_2");
  const [grade, setGrade] = useState<string>(GRADES_BY_STAGE[(stages[0] ?? "primary_1_2") as keyof typeof GRADES_BY_STAGE][0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: students } = useQuery({
    queryKey: ["staff-att-students", stage, grade, yearId ?? ""],
    queryFn: async () => {
      let q = supabase
        .from("student_enrollments")
        .select("user_id, profiles!student_enrollments_user_id_profiles_fkey(full_name, national_id)")
        .eq("stage_group", stage as never)
        .eq("grade_level", grade as never);
      if (yearId) q = q.eq("academic_year_id", yearId as never);
      return (await q).data ?? [];
    },
  });
  const { data: recs } = useQuery({
    queryKey: ["staff-att-recs", stage, grade, date, yearId ?? ""],
    queryFn: async () => {
      let q = supabase.from("attendance").select("*").eq("date", date);
      if (yearId) q = q.eq("academic_year_id", yearId as never);
      return (await q).data ?? [];
    },
  });
  const map = new Map((recs ?? []).map((r) => [r.student_id, r]));

  async function mark(studentId: string, status: "present" | "absent" | "late") {
    if (!me || readOnly) return;
    const existing = map.get(studentId);
    const payload = { student_id: studentId, date, status, recorded_by: me.userId };
    const q = existing
      ? supabase.from("attendance").update(payload).eq("id", existing.id)
      : supabase.from("attendance").insert(payload);
    const { error } = await q;
    if (error) return toast.error(formatSupabaseError(error));
    qc.invalidateQueries({ queryKey: ["staff-att-recs", stage, grade, date, yearId ?? ""] });
  }

  async function markAllPresent() {
    if (!me || !students || students.length === 0 || readOnly) return;
    const toInsert: Array<{ student_id: string; date: string; status: "present"; recorded_by: string }> = [];
    const toUpdate: Array<{ id: string }> = [];
    for (const s of students) {
      const existing = map.get(s.user_id);
      if (existing) {
        if (existing.status !== "present") toUpdate.push({ id: existing.id });
      } else {
        toInsert.push({ student_id: s.user_id, date, status: "present", recorded_by: me.userId });
      }
    }
    const ops: Array<PromiseLike<{ error: { message: string } | null }>> = [];
    if (toInsert.length > 0) ops.push(supabase.from("attendance").insert(toInsert) as unknown as PromiseLike<{ error: { message: string } | null }>);
    for (const u of toUpdate) ops.push(supabase.from("attendance").update({ status: "present", recorded_by: me.userId }).eq("id", u.id) as unknown as PromiseLike<{ error: { message: string } | null }>);
    const results = await Promise.all(ops);
    const err = results.find((r) => r?.error);
    if (err?.error) return toast.error(formatSupabaseError(err.error));
    qc.invalidateQueries({ queryKey: ["staff-att-recs", stage, grade, date, yearId ?? ""] });
    toast.success(t("attendance.mark_all_present"));
  }

  const gradesForStage = GRADES_BY_STAGE[stage as keyof typeof GRADES_BY_STAGE] ?? [];

  return (
    <Section title={t("nav.attendance")}>
      {readOnly && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm mb-4">
          {t("year.viewing_past_readonly")}
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={stage} onValueChange={(v) => { setStage(v); setGrade(GRADES_BY_STAGE[v as keyof typeof GRADES_BY_STAGE][0]); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{stages.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={markAllPresent} disabled={!students || students.length === 0}>
            {t("attendance.mark_all_present")}
          </Button>
        )}
      </div>
      {(students ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : (
        <div className="rounded-lg border divide-y">
          {students!.map((s) => {
            const p = (s as unknown as { profiles?: { full_name: string } }).profiles;
            const status = map.get(s.user_id)?.status;
            return (
              <div key={s.user_id} className="flex items-center justify-between p-3 gap-2 flex-wrap">
                <div>{p?.full_name}</div>
                <div className="flex gap-1">
                  {(["present", "late", "absent"] as const).map((st) => (
                    <Button key={st} size="sm" variant={status === st ? "default" : "outline"} onClick={() => mark(s.user_id, st)} disabled={readOnly}>{t(`attendance.${st}`)}</Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
