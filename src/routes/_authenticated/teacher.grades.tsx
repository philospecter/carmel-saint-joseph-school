import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { useMe } from "@/hooks/use-me";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Lock, Clock } from "lucide-react";
import { formatSupabaseError } from "@/lib/errors";
import { listTermMonths } from "@/lib/settings.functions";
import { listGradesForCell, getGradeCellMax, type GradeCellRow } from "@/lib/grades.functions";
import { useCurrentYearId } from "@/lib/rosters";

export const Route = createFileRoute("/_authenticated/teacher/grades")({ component: Page });

const MONTH_LABEL = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Term = "term_1" | "term_2" | "midyear" | "final";
const TERMS: Term[] = ["term_1", "term_2", "midyear", "final"];

function fmt(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

type Assignment = {
  id: string;
  subject_id: string;
  subjects: { id: string; name: string; stage_group: string; grade_level: string };
};

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data: currentYearId } = useCurrentYearId();

  const { data: assignments } = useQuery({
    queryKey: ["teacher-assignments-grades", me?.userId, currentYearId],
    enabled: !!me?.userId && !!currentYearId,
    queryFn: async () =>
      ((await supabase
        .from("teacher_assignments")
        .select("id, subject_id, subjects(id, name, stage_group, grade_level)")
        .eq("teacher_id", me!.userId)
        .eq("academic_year_id", currentYearId!)).data ?? []) as unknown as Assignment[],
  });

  const [subject, setSubject] = useState<string>("");
  const [term, setTerm] = useState<Term>("term_1");

  const selected = (assignments ?? []).find((a) => a.subject_id === subject);

  const termMonthsFn = useServerFn(listTermMonths);
  const { data: termMonths } = useQuery({ queryKey: ["term-months"], queryFn: () => termMonthsFn() });
  const configuredMonths = useMemo(() => {
    if (term === "term_1") return termMonths?.term_1 ?? [10, 11];
    if (term === "term_2") return termMonths?.term_2 ?? [2, 3];
    return [];
  }, [term, termMonths]);
  const [month, setMonth] = useState<number | null>(null);
  useEffect(() => {
    if (term === "midyear" || term === "final") { setMonth(null); return; }
    if (configuredMonths.length === 0) { setMonth(null); return; }
    setMonth((prev) => (prev !== null && configuredMonths.includes(prev) ? prev : configuredMonths[0]));
  }, [term, configuredMonths]);

  const cellReady = !!subject && (term === "midyear" || term === "final" || month !== null);

  const cellMaxFn = useServerFn(getGradeCellMax);
  const maxKey = ["t-grade-cell-max", subject, term, month] as const;
  const { data: cellMaxData } = useQuery({
    queryKey: maxKey,
    enabled: cellReady,
    queryFn: () => cellMaxFn({ data: { subject_id: subject, term, month } }),
  });

  const gradesFn = useServerFn(listGradesForCell);
  const gradesKey = ["t-grades-cell", subject, term, month] as const;
  const { data: cellGrades } = useQuery({
    queryKey: gradesKey,
    enabled: cellReady,
    queryFn: () => gradesFn({ data: { subject_id: subject, term, month } }),
  });
  const gradeMap = new Map<string, GradeCellRow>((cellGrades ?? []).map((g) => [g.student_id, g]));

  const { data: students } = useQuery({
    queryKey: ["t-stud", selected?.subjects.stage_group, selected?.subjects.grade_level, currentYearId],
    enabled: !!selected && !!currentYearId,
    queryFn: async () =>
      (await supabase
        .from("student_enrollments")
        .select("user_id, is_graduated, profiles!student_enrollments_user_id_profiles_fkey(full_name)")
        .eq("stage_group", selected!.subjects.stage_group as never)
        .eq("grade_level", selected!.subjects.grade_level as never)
        .eq("academic_year_id", currentYearId!)).data ?? [],
  });

  const [draftMax, setDraftMax] = useState<string>("");
  useEffect(() => { setDraftMax(""); }, [subject, term, month]);
  const effectiveMax = cellMaxData?.max_score ?? null;
  const locked = effectiveMax !== null;
  const maxValue = locked ? String(effectiveMax) : draftMax;
  const sessionMax = locked ? (effectiveMax as number) : (Number(draftMax) || 0);
  const rosterReady = cellReady && sessionMax > 0;
  const showMonth = term === "term_1" || term === "term_2";

  return (
    <Section title={t("nav.grades")}>
      <div className="rounded-md border border-blue-500/40 bg-blue-500/5 p-3 text-sm mb-4">
        Grades you enter are pending until an administrator approves them. Students see only approved grades.
      </div>
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select subject" /></SelectTrigger>
          <SelectContent>
            {(assignments ?? []).map((a) => (
              <SelectItem key={a.subject_id} value={a.subject_id}>
                {a.subjects.name} — {t(`grade.${a.subjects.grade_level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={term} onValueChange={(v) => setTerm(v as Term)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{TERMS.map((tm) => <SelectItem key={tm} value={tm}>{t(`term.${tm}`)}</SelectItem>)}</SelectContent>
        </Select>
        {showMonth && (
          <Select value={month === null ? "" : String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>{configuredMonths.map((m) => <SelectItem key={m} value={String(m)}>{MONTH_LABEL[m]}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("grades.session_max")}</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number" min={1} step="any" className="w-28"
              value={maxValue} placeholder="e.g. 60"
              disabled={!cellReady || locked} readOnly={locked}
              onChange={(e) => setDraftMax(e.target.value)}
            />
            {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground ms-1" />}
          </div>
        </div>
      </div>

      {!subject ? (
        <EmptyState text="Pick a subject." />
      ) : showMonth && month === null ? (
        <EmptyState text={t("settings.no_months")} />
      ) : !rosterReady ? (
        <EmptyState text={t("grades.set_max_hint")} />
      ) : (students ?? []).length === 0 ? (
        <EmptyState text={t("common.empty")} />
      ) : (
        <div className="rounded-lg border divide-y">
          {students!.map((s) => {
            const p = (s as unknown as { profiles?: { full_name: string } }).profiles;
            const existing = gradeMap.get(s.user_id) ?? null;
            return (
              <Row
                key={s.user_id}
                studentId={s.user_id}
                studentName={p?.full_name ?? "—"}
                isGraduated={s.is_graduated}
                existing={existing}
                subjectId={subject}
                term={term}
                month={month}
                sessionMax={sessionMax}
                enteredById={me?.userId ?? ""}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: gradesKey });
                  qc.invalidateQueries({ queryKey: maxKey });
                }}
              />
            );
          })}
        </div>
      )}
    </Section>
  );
}

function Row({ studentId, studentName, isGraduated, existing, subjectId, term, month, sessionMax, enteredById, onSaved }: {
  studentId: string; studentName: string; isGraduated?: boolean; existing: GradeCellRow | null;
  subjectId: string; term: Term; month: number | null; sessionMax: number;
  enteredById: string; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [unlocked, setUnlocked] = useState(!existing);
  const [value, setValue] = useState<string>(existing ? String(existing.score) : "");
  useEffect(() => { setValue(existing ? String(existing.score) : ""); setUnlocked(!existing); }, [existing?.id, existing?.score, existing?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowMax = existing?.max_score ?? sessionMax;

  const saveM = useMutation({
    mutationFn: async () => {
      const n = Number(value);
      if (value.trim() === "" || Number.isNaN(n)) throw new Error("Enter a valid score.");
      if (!Number.isFinite(sessionMax) || sessionMax <= 0) throw new Error(t("grades.session_max_invalid"));
      if (n < 0 || n > sessionMax) throw new Error(fmt(t("grades.range_error"), { max: sessionMax }));
      const sb = supabase as any;
      let q = sb.from("grades").select("id").eq("student_id", studentId).eq("subject_id", subjectId).eq("term", term);
      q = month === null ? q.is("month", null) : q.eq("month", month);
      const { data: found, error: findErr } = await q.maybeSingle();
      if (findErr) throw findErr;
      if (found?.id) {
        const { error } = await sb.from("grades").update({ score: n, max_score: sessionMax, entered_by: enteredById }).eq("id", found.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("grades").insert({ student_id: studentId, subject_id: subjectId, term, month, score: n, max_score: sessionMax, entered_by: enteredById });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(t("common.save")); onSaved(); setUnlocked(false); },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  return (
    <div className="p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate">{studentName}</div>
        {isGraduated && (
          <Badge variant="outline" className="text-xs mt-0.5 border-emerald-500/50 text-emerald-600">Graduated</Badge>
        )}
        {existing && !existing.approved_at && (
          <Badge variant="outline" className="text-xs mt-0.5 border-amber-500/50 text-amber-600">
            <Clock className="h-3 w-3 mr-1" />Pending approval
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!unlocked && existing ? (
          <>
            {existing.score < rowMax / 2 && <Badge variant="destructive" className="text-xs">{t("grades.failed")}</Badge>}
            <Badge variant={existing.score < rowMax / 2 ? "destructive" : "secondary"} className="font-serif text-base px-3 py-1">
              {existing.score}/{rowMax}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setUnlocked(true)}>
              <Pencil className="h-3 w-3 mr-1" />{t("grades.edit")}
            </Button>
          </>
        ) : (
          <>
            <Input type="number" className="w-24" min={0} max={sessionMax} step="any" value={value} placeholder={t("grades.enter_placeholder")} onChange={(e) => setValue(e.target.value)} />
            <span className="text-sm text-muted-foreground">/ {sessionMax}</span>
            <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending}>{t("common.save")}</Button>
            {existing && (
              <Button size="sm" variant="ghost" onClick={() => { setValue(String(existing.score)); setUnlocked(false); }}>{t("common.cancel")}</Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}