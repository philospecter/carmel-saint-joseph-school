import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, STAGE_GROUPS, GRADES_BY_STAGE } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { useMe } from "@/hooks/use-me";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { formatSupabaseError } from "@/lib/errors";
import { listTermMonths } from "@/lib/settings.functions";
import { listGradesForCell, getGradeCellMax, setGradeCellMax, type GradeCellRow } from "@/lib/grades.functions";

export const Route = createFileRoute("/_authenticated/staff/grades")({ component: Page });

const MONTH_LABEL = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Term = "term_1" | "term_2" | "midyear" | "final";
const TERMS: Term[] = ["term_1", "term_2", "midyear", "final"];

function fmt(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isAdmin = !!me?.roles.includes("admin");
  const stages = isAdmin ? [...STAGE_GROUPS] : me?.stages ?? [];
  const [stage, setStage] = useState<string>(stages[0] ?? "primary_1_2");
  const [grade, setGrade] = useState<string>(
    GRADES_BY_STAGE[(stages[0] ?? "primary_1_2") as keyof typeof GRADES_BY_STAGE][0],
  );
  const [subject, setSubject] = useState<string>("");
  const [term, setTerm] = useState<Term>("term_1");

  const termMonthsFn = useServerFn(listTermMonths);
  const { data: termMonths } = useQuery({
    queryKey: ["term-months"],
    queryFn: () => termMonthsFn(),
  });
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

  const { data: subjects } = useQuery({
    queryKey: ["subj", stage, grade],
    queryFn: async () =>
      (await (supabase as any)
        .from("subjects")
        .select("id, name")
        .eq("stage_group", stage)
        .eq("grade_level", grade)
        .order("name")).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["stud", stage, grade],
    queryFn: async () =>
      (await supabase
        .from("student_enrollments")
        .select("user_id, profiles!student_enrollments_user_id_profiles_fkey(full_name)")
        .eq("stage_group", stage as never)
        .eq("grade_level", grade as never)).data ?? [],
  });

  const cellReady = !!subject && (term === "midyear" || term === "final" || month !== null);

  const cellMaxFn = useServerFn(getGradeCellMax);
  const maxKey = ["grade-cell-max", subject, term, month] as const;
  const { data: cellMaxData } = useQuery({
    queryKey: maxKey,
    enabled: cellReady,
    queryFn: () => cellMaxFn({ data: { subject_id: subject, term, month } }),
  });

  const gradesFn = useServerFn(listGradesForCell);
  const gradesKey = ["grades-cell", subject, term, month] as const;
  const { data: cellGrades } = useQuery({
    queryKey: gradesKey,
    enabled: cellReady,
    queryFn: () => gradesFn({ data: { subject_id: subject, term, month } }),
  });
  const gradeMap = new Map<string, GradeCellRow>((cellGrades ?? []).map((g) => [g.student_id, g]));

  const gradesForStage = GRADES_BY_STAGE[stage as keyof typeof GRADES_BY_STAGE] ?? [];
  const showMonth = term === "term_1" || term === "term_2";

  // Local session max (used only before any row exists in this cell).
  const [pendingMax, setPendingMax] = useState<string>("");
  const [editMaxOpen, setEditMaxOpen] = useState(false);
  const [editMaxValue, setEditMaxValue] = useState<string>("");

  useEffect(() => {
    setPendingMax("");
    setEditMaxOpen(false);
  }, [subject, term, month]);

  const effectiveMax = cellMaxData?.max_score ?? null;

  const rescaleFn = useServerFn(setGradeCellMax);
  const rescaleM = useMutation({
    mutationFn: () => {
      const v = Number(editMaxValue);
      if (!Number.isFinite(v) || v <= 0) throw new Error(t("grades.session_max_invalid"));
      return rescaleFn({ data: { subject_id: subject, term, month, new_max: v } });
    },
    onSuccess: () => {
      toast.success(t("grades.session_max_updated"));
      setEditMaxOpen(false);
      qc.invalidateQueries({ queryKey: maxKey });
      qc.invalidateQueries({ queryKey: gradesKey });
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  return (
    <Section title={t("nav.grades")}>
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={stage} onValueChange={(v) => { setStage(v); setGrade(GRADES_BY_STAGE[v as keyof typeof GRADES_BY_STAGE][0]); setSubject(""); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{stages.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={grade} onValueChange={(v) => { setGrade(v); setSubject(""); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Subject" /></SelectTrigger>
          <SelectContent>
            {(subjects ?? []).map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={term} onValueChange={(v) => setTerm(v as Term)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TERMS.map((tm) => <SelectItem key={tm} value={tm}>{t(`term.${tm}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        {showMonth && (
          <Select value={month === null ? "" : String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>{configuredMonths.map((m) => <SelectItem key={m} value={String(m)}>{MONTH_LABEL[m]}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {!subject ? (
        <EmptyState text="Pick a subject." />
      ) : showMonth && month === null ? (
        <EmptyState text={t("settings.no_months")} />
      ) : effectiveMax === null && !(Number(pendingMax) > 0) ? (
        // Cell empty — prompt for session max before roster appears
        <div className="rounded-lg border p-6 space-y-3 max-w-md">
          <div className="font-serif text-lg">{t("grades.set_session_max")}</div>
          <p className="text-sm text-muted-foreground">{t("grades.set_session_max_body")}</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              step="any"
              className="w-32"
              value={pendingMax}
              placeholder="e.g. 60"
              onChange={(e) => setPendingMax(e.target.value)}
            />
            <Button
              onClick={() => {
                const v = Number(pendingMax);
                if (!Number.isFinite(v) || v <= 0) return toast.error(t("grades.session_max_invalid"));
                // Nothing to persist yet — this value is attached to the first insert.
                toast.success(fmt(t("grades.session_max_ready"), { max: v }));
              }}
              disabled={!pendingMax.trim()}
            >
              {t("common.save")}
            </Button>
          </div>
        </div>

      ) : (students ?? []).length === 0 ? (
        <EmptyState text={t("common.empty")} />
      ) : (
        <>
          {/* Session max banner */}
          <div className="mb-3 flex items-center justify-between rounded-lg border bg-secondary/30 p-3">
            <div className="text-sm">
              <span className="text-muted-foreground">{t("grades.session_max")}: </span>
              <span className="font-serif text-base">{effectiveMax !== null ? effectiveMax : (Number(pendingMax) || "—")}</span>
              {(cellMaxData?.row_count ?? 0) > 0 && (
                <span className="text-xs text-muted-foreground ms-2">
                  {fmt(t("grades.session_row_count"), { count: cellMaxData!.row_count })}
                </span>
              )}
            </div>
            {effectiveMax !== null && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditMaxValue(String(effectiveMax)); setEditMaxOpen(true); }}
              >
                <Pencil className="h-3 w-3 me-1" />
                {t("grades.edit_session_max")}
              </Button>
            )}
          </div>

          <div className="rounded-lg border divide-y">
            {students!.map((s) => {
              const p = (s as unknown as { profiles?: { full_name: string } }).profiles;
              const existing = gradeMap.get(s.user_id) ?? null;
              const sessionMax = effectiveMax !== null ? effectiveMax : (Number(pendingMax) || 0);
              return (
                <GradeRow
                  key={s.user_id}
                  studentId={s.user_id}
                  studentName={p?.full_name ?? "—"}
                  existing={existing}
                  subjectId={subject}
                  term={term}
                  month={month}
                  sessionMax={sessionMax}
                  enteredById={me?.userId ?? ""}
                  showAudit={isAdmin}
                  onSaved={() => {
                    qc.invalidateQueries({ queryKey: gradesKey });
                    qc.invalidateQueries({ queryKey: maxKey });
                  }}
                />
              );
            })}
          </div>

          <Dialog open={editMaxOpen} onOpenChange={setEditMaxOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("grades.edit_session_max")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {fmt(t("grades.rescale_warning"), { count: cellMaxData?.row_count ?? 0 })}
                </p>
                <div>
                  <Label>{t("grades.session_max")}</Label>
                  <Input
                    type="number"
                    min={1}
                    step="any"
                    value={editMaxValue}
                    onChange={(e) => setEditMaxValue(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditMaxOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={() => rescaleM.mutate()} disabled={rescaleM.isPending || !editMaxValue.trim()}>
                  {rescaleM.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </Section>
  );
}

function GradeRow({
  studentId, studentName, existing, subjectId, term, month, sessionMax, enteredById, showAudit, onSaved,
}: {
  studentId: string;
  studentName: string;
  existing: GradeCellRow | null;
  subjectId: string;
  term: Term;
  month: number | null;
  sessionMax: number;
  enteredById: string;
  showAudit: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const hasSaved = existing !== null;
  const [unlocked, setUnlocked] = useState(!hasSaved);
  const [value, setValue] = useState<string>(existing ? String(existing.score) : "");

  useEffect(() => {
    setValue(existing ? String(existing.score) : "");
    setUnlocked(!existing);
  }, [existing?.id, existing?.score, existing?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowMax = existing?.max_score ?? sessionMax;

  const saveM = useMutation({
    mutationFn: async () => {
      const n = Number(value);
      if (value.trim() === "" || Number.isNaN(n)) throw new Error("Enter a valid score.");
      if (!Number.isFinite(sessionMax) || sessionMax <= 0) throw new Error(t("grades.session_max_invalid"));
      if (n < 0 || n > sessionMax) throw new Error(fmt(t("grades.range_error"), { max: sessionMax }));
      const sb = supabase as any;
      let q = sb.from("grades").select("id")
        .eq("student_id", studentId)
        .eq("subject_id", subjectId)
        .eq("term", term);
      q = month === null ? q.is("month", null) : q.eq("month", month);
      const { data: found, error: findErr } = await q.maybeSingle();
      if (findErr) throw findErr;
      if (found?.id) {
        const { error } = await sb.from("grades")
          .update({ score: n, max_score: sessionMax, entered_by: enteredById })
          .eq("id", found.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("grades").insert({
          student_id: studentId,
          subject_id: subjectId,
          term,
          month,
          score: n,
          max_score: sessionMax,
          entered_by: enteredById,
        });
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
        {showAudit && existing && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {existing.entered_by_name
              ? fmt(t("grades.entered_by"), { name: existing.entered_by_name, when: timeAgo(existing.updated_at) })
              : fmt(t("grades.entered_by_unknown"), { when: timeAgo(existing.updated_at) })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!unlocked && existing ? (
          <>
            {existing.score < rowMax / 2 && (
              <Badge variant="destructive" className="text-xs">{t("grades.failed")}</Badge>
            )}
            <Badge
              variant={existing.score < rowMax / 2 ? "destructive" : "secondary"}
              className="font-serif text-base px-3 py-1"
            >
              {existing.score}/{rowMax}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setUnlocked(true)}>
              <Pencil className="h-3 w-3 mr-1" />{t("grades.edit")}
            </Button>
          </>
        ) : (
          <>
            <Input
              type="number"
              className="w-24"
              min={0}
              max={sessionMax}
              step="any"
              value={value}
              placeholder={t("grades.enter_placeholder")}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">/ {sessionMax}</span>
            <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending}>{t("common.save")}</Button>
            {existing && (
              <Button size="sm" variant="ghost" onClick={() => { setValue(String(existing.score)); setUnlocked(false); }}>
                {t("common.cancel")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
