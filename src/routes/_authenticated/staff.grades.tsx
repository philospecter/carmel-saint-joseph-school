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
import { Pencil, Lock, Check, ChevronRight } from "lucide-react";
import { formatSupabaseError } from "@/lib/errors";
import { listTermMonths } from "@/lib/settings.functions";
import { listGradesForCell, getGradeCellMax, clearGradeCell, approveGrades, approveAllPending, countAllPending, listPendingCells, type GradeCellRow } from "@/lib/grades.functions";
import { useCurrentYearId, resolveRosterYear } from "@/lib/rosters";

export const Route = createFileRoute("/_authenticated/staff/grades")({
  validateSearch: (search: Record<string, unknown>): { year?: string } => ({
    year: typeof search.year === "string" && search.year ? search.year : undefined,
  }),
  component: Page,
});

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
  const { year: yearId } = Route.useSearch();
  const readOnly = !!yearId;
  const isAdmin = !!me?.roles.includes("admin");
  const canManageApprovals = isAdmin || !!me?.roles.includes("stage_manager");
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

  const { data: currentYearId } = useCurrentYearId();
  const effectiveYearId = resolveRosterYear(yearId, currentYearId);
  const { data: students } = useQuery({
    queryKey: ["stud", stage, grade, effectiveYearId ?? ""],
    enabled: !!effectiveYearId,
    queryFn: async () =>
      (await supabase
        .from("student_enrollments")
        .select("user_id, is_graduated, profiles!student_enrollments_user_id_profiles_fkey(full_name)")
        .eq("stage_group", stage as never)
        .eq("grade_level", grade as never)
        .eq("academic_year_id", effectiveYearId as never)).data ?? [],
  });

  const cellReady = !!subject && (term === "midyear" || term === "final" || month !== null);

  const cellMaxFn = useServerFn(getGradeCellMax);
  const maxKey = ["grade-cell-max", subject, term, month, yearId ?? ""] as const;
  const { data: cellMaxData } = useQuery({
    queryKey: maxKey,
    enabled: cellReady,
    queryFn: () => cellMaxFn({ data: { subject_id: subject, term, month, year_id: yearId ?? null } }),
  });

  const gradesFn = useServerFn(listGradesForCell);
  const gradesKey = ["grades-cell", subject, term, month, yearId ?? ""] as const;
  const { data: cellGrades } = useQuery({
    queryKey: gradesKey,
    enabled: cellReady,
    queryFn: () => gradesFn({ data: { subject_id: subject, term, month, year_id: yearId ?? null } }),
  });
  const gradeMap = new Map<string, GradeCellRow>((cellGrades ?? []).map((g) => [g.student_id, g]));

  const gradesForStage = GRADES_BY_STAGE[stage as keyof typeof GRADES_BY_STAGE] ?? [];
  const showMonth = term === "term_1" || term === "term_2";

  // Draft max input in the filter bar (editable only while the cell is empty).
  const [draftMax, setDraftMax] = useState<string>("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  useEffect(() => {
    setDraftMax("");
    setConfirmClearOpen(false);
  }, [subject, term, month]);

  const effectiveMax = cellMaxData?.max_score ?? null;
  const locked = effectiveMax !== null;
  const maxValue = locked ? String(effectiveMax) : draftMax;
  const sessionMax = locked ? (effectiveMax as number) : (Number(draftMax) || 0);
  const rosterReady = cellReady && sessionMax > 0;

  const clearFn = useServerFn(clearGradeCell);
  const clearM = useMutation({
    mutationFn: () => clearFn({ data: { subject_id: subject, term, month } }),
    onSuccess: () => {
      toast.success(t("grades.cell_cleared"));
      setConfirmClearOpen(false);
      setDraftMax("");
      qc.invalidateQueries({ queryKey: maxKey });
      qc.invalidateQueries({ queryKey: gradesKey });
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  const approveFn = useServerFn(approveGrades);
  const approveM = useMutation({
    mutationFn: (ids: string[]) => approveFn({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`Approved ${r.approved} grade(s)`);
      qc.invalidateQueries({ queryKey: gradesKey });
      qc.invalidateQueries({ queryKey: ["grades-pending-all"] });
      qc.invalidateQueries({ queryKey: ["grades-pending-cells"] });
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });
  const pendingIds = (cellGrades ?? []).filter((g) => !g.approved_at).map((g) => g.id);
  const canApprove = canManageApprovals && !readOnly && pendingIds.length > 0;

  const countAllFn = useServerFn(countAllPending);
  const { data: allPending } = useQuery({
    queryKey: ["grades-pending-all"],
    enabled: canManageApprovals && !readOnly,
    queryFn: () => countAllFn(),
  });
  const pendingCellsFn = useServerFn(listPendingCells);
  const { data: pendingCells } = useQuery({
    queryKey: ["grades-pending-cells"],
    enabled: canManageApprovals && !readOnly,
    queryFn: () => pendingCellsFn(),
  });
  const approveAllFn = useServerFn(approveAllPending);
  const approveAllM = useMutation({
    mutationFn: () => approveAllFn(),
    onSuccess: (r) => {
      toast.success(`Approved ${r.approved} grade(s) school-wide`);
      qc.invalidateQueries({ queryKey: ["grades-pending-all"] });
      qc.invalidateQueries({ queryKey: ["grades-pending-cells"] });
      qc.invalidateQueries({ queryKey: gradesKey });
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  function openPendingCell(c: { stage_group: string; grade_level: string; subject_id: string; term: Term; month: number | null }) {
    setStage(c.stage_group);
    setGrade(c.grade_level);
    setSubject(c.subject_id);
    setTerm(c.term);
    setMonth(c.month);
  }

  return (
    <Section title={t("nav.grades")}>
      {readOnly && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm mb-4">
          {t("year.viewing_past_readonly")}
        </div>
      )}
      {canManageApprovals && !readOnly && (allPending?.count ?? 0) > 0 && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm mb-4">
          <div className="flex items-center justify-between gap-3">
            <span>{allPending!.count} pending grade(s) awaiting your approval this year.</span>
            <Button size="sm" onClick={() => approveAllM.mutate()} disabled={approveAllM.isPending}>
              <Check className="h-3.5 w-3.5 mr-1" /> Approve all pending
            </Button>
          </div>
          {(pendingCells ?? []).length > 0 && (
            <div className="mt-3 rounded-md border divide-y bg-background">
              {(pendingCells ?? []).map((c) => (
                <button
                  key={`${c.subject_id}-${c.term}-${c.month ?? "n"}`}
                  type="button"
                  className="w-full text-start p-2 flex items-center justify-between gap-2 hover:bg-muted/50"
                  onClick={() => openPendingCell({ ...c, term: c.term as Term })}
                >
                  <span className="min-w-0 truncate">
                    {c.subject_name} — {t(`grade.${c.grade_level}`)} · {t(`term.${c.term}`)}
                    {c.month !== null ? ` · ${MONTH_LABEL[c.month]}` : ""}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="border-amber-500/50 text-amber-600">{c.pending_count}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {canApprove && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm mb-4 flex items-center justify-between gap-3">
          <span>{pendingIds.length} grade(s) pending approval — students cannot see them yet.</span>
          <Button size="sm" onClick={() => approveM.mutate(pendingIds)} disabled={approveM.isPending}>
            <Check className="h-3.5 w-3.5 mr-1" /> Approve all
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-4 items-end">

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
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{t("grades.session_max")}</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              step="any"
              className="w-28"
              value={maxValue}
              placeholder="e.g. 60"
              disabled={!cellReady || locked}
              readOnly={locked}
              onChange={(e) => setDraftMax(e.target.value)}
            />
            {locked && !readOnly && (
              <Button
                size="icon"
                variant="outline"
                title={t("grades.edit_session_max")}
                onClick={() => setConfirmClearOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {locked && !confirmClearOpen && (
              <Lock className="h-3.5 w-3.5 text-muted-foreground ms-1" />
            )}
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
              <GradeRow
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
                showAudit={isAdmin}
                readOnly={readOnly}
                isAdmin={canManageApprovals}
                onApprove={(id) => approveM.mutate([id])}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: gradesKey });
                  qc.invalidateQueries({ queryKey: maxKey });
                }}
              />
            );
          })}
        </div>
      )}

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("grades.edit_session_max")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {fmt(t("grades.clear_warning"), { count: cellMaxData?.row_count ?? 0 })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClearOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => clearM.mutate()}
              disabled={clearM.isPending}
            >
              {clearM.isPending ? t("common.loading") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}


function GradeRow({
  studentId, studentName, isGraduated, existing, subjectId, term, month, sessionMax, enteredById, showAudit, readOnly, isAdmin, onApprove, onSaved,
}: {
  studentId: string;
  studentName: string;
  isGraduated?: boolean;
  existing: GradeCellRow | null;
  subjectId: string;
  term: Term;
  month: number | null;
  sessionMax: number;
  enteredById: string;
  showAudit: boolean;
  readOnly?: boolean;
  isAdmin?: boolean;
  onApprove?: (id: string) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const hasSaved = existing !== null;
  const [unlocked, setUnlocked] = useState(!hasSaved && !readOnly);
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
        {isGraduated && (
          <Badge variant="outline" className="text-xs mt-0.5 border-emerald-500/50 text-emerald-600">Graduated</Badge>
        )}
        {existing && !existing.approved_at && (
          <Badge variant="outline" className="text-xs mt-0.5 border-amber-500/50 text-amber-600">Pending approval</Badge>
        )}
        {showAudit && existing && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {existing.entered_by_name
              ? fmt(t("grades.entered_by"), { name: existing.entered_by_name, when: timeAgo(existing.updated_at) })
              : fmt(t("grades.entered_by_unknown"), { when: timeAgo(existing.updated_at) })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {(!unlocked && existing) || (readOnly && existing) ? (
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
            {isAdmin && !existing.approved_at && !readOnly && onApprove && (
              <Button size="sm" variant="outline" onClick={() => onApprove(existing.id)}>
                <Check className="h-3 w-3 mr-1" />Approve
              </Button>
            )}
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={() => setUnlocked(true)}>
                <Pencil className="h-3 w-3 mr-1" />{t("grades.edit")}
              </Button>
            )}
          </>
        ) : readOnly ? (
          <span className="text-sm text-muted-foreground">—</span>
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
