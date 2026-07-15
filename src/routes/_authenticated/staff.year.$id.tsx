import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, STAGE_GROUPS, GRADES_BY_STAGE } from "@/lib/i18n";
import { useMe } from "@/hooks/use-me";
import { ChevronLeft, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/staff/year/$id")({ component: Page });

const MONTH_LABEL = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Term = "term_1" | "term_2" | "midyear" | "final";
const TERMS: Term[] = ["term_1", "term_2", "midyear", "final"];

type Row = Record<string, string | number>;

function downloadXLSX(name: string, rows: Row[], sheet = "Sheet1") {
  if (rows.length === 0) { toast.info("No data"); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, name);
}

function toCSV(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
function downloadCSV(name: string, rows: Row[]) {
  if (rows.length === 0) { toast.info("No data"); return; }
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function downloadPDF(name: string, title: string, rows: Row[]) {
  if (rows.length === 0) { toast.info("No data"); return; }
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  const columns = Object.keys(rows[0]);
  autoTable(doc, {
    startY: 20,
    head: [columns],
    body: rows.map((r) => columns.map((c) => String(r[c] ?? ""))),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [70, 70, 70] },
  });
  doc.save(name);
}

function Page() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { data: me } = useMe();
  const isAdmin = !!me?.roles.includes("admin");

  const { data: year } = useQuery({
    queryKey: ["year", id],
    queryFn: async () =>
      (await (supabase as any).from("academic_years").select("id,label,started_at,closed_at,is_current").eq("id", id).maybeSingle()).data,
  });

  if (!isAdmin) return <div className="p-8">{t("common.empty")}</div>;
  if (!year) return <EmptyState text={t("common.loading")} />;

  return (
    <Section
      title={`${t("year.title")} · ${year.label}`}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/staff/year"><ChevronLeft className="w-4 h-4 mr-1" />{t("common.back")}</Link>
        </Button>
      }
    >
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm mb-4">
        {year.is_current ? t("year.current") : `${t("year.closed")} — ${t("year.viewing_past_readonly")}`}
      </div>

      <ViewPanel yearId={id} yearLabel={year.label} />

      <div className="mt-4 text-xs text-muted-foreground">
        <Badge variant="secondary">{t("year.viewing_past_readonly")}</Badge>
      </div>
    </Section>
  );
}

function ViewPanel({ yearId, yearLabel }: { yearId: string; yearLabel: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"grades" | "attendance" | "graduates" | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">View year data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === "grades" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("grades")}
          >
            {t("nav.grades")}
          </Button>
          <Button
            variant={mode === "attendance" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("attendance")}
          >
            {t("nav.attendance")}
          </Button>
          <Button
            variant={mode === "graduates" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("graduates")}
          >
            Graduates
          </Button>
        </div>

        {mode === "grades" && <GradesPanel yearId={yearId} yearLabel={yearLabel} />}
        {mode === "attendance" && <AttendancePanel yearId={yearId} yearLabel={yearLabel} />}
        {mode === "graduates" && <GraduatesPanel yearId={yearId} yearLabel={yearLabel} />}
        {mode === null && (
          <div className="text-sm text-muted-foreground">Choose what you want to view.</div>
        )}
      </CardContent>
    </Card>
  );
}

function GraduatesPanel({ yearId, yearLabel }: { yearId: string; yearLabel: string }) {
  const { t } = useI18n();
  const { data: grads, isLoading } = useQuery({
    queryKey: ["yr-graduates", yearId],
    queryFn: async () =>
      (await supabase.from("student_enrollments")
        .select("user_id, stage_group, grade_level, profiles!student_enrollments_user_id_profiles_fkey(full_name, national_id, email, mobile)")
        .eq("academic_year_id", yearId as never)
        .eq("is_graduated", true as never)).data ?? [],
  });

  function exportRows(fmt: "csv" | "xlsx" | "pdf") {
    const rows: Row[] = (grads ?? []).map((s: any) => ({
      name: s.profiles?.full_name ?? "",
      national_id: s.profiles?.national_id ?? "",
      email: s.profiles?.email ?? "",
      mobile: s.profiles?.mobile ?? "",
      stage: t(`stage.${s.stage_group}`),
      grade: t(`grade.${s.grade_level}`),
    }));
    const base = `graduates_${yearLabel}`;
    if (fmt === "csv") downloadCSV(`${base}.csv`, rows);
    else if (fmt === "xlsx") downloadXLSX(`${base}.xlsx`, rows, "Graduates");
    else downloadPDF(`${base}.pdf`, `Graduates — ${yearLabel}`, rows);
  }

  if (isLoading) return <EmptyState text={t("common.loading")} />;
  const list = grads ?? [];

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {list.length} student{list.length === 1 ? "" : "s"} graduated in {yearLabel}
      </div>
      {list.length === 0 ? (
        <EmptyState text="No graduates for this year." />
      ) : (
        <div className="rounded-lg border divide-y">
          {list.map((s: any) => (
            <div key={s.user_id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.profiles?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {s.profiles?.national_id ?? "—"} · {t(`stage.${s.stage_group}`)} · {t(`grade.${s.grade_level}`)}
                </div>
              </div>
              <Badge variant="secondary">Graduated</Badge>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <div className="text-sm font-medium w-full">Export</div>
        <Button size="sm" variant="outline" onClick={() => exportRows("csv")} disabled={list.length === 0}>
          <Download className="w-3 h-3 mr-1" />CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportRows("xlsx")} disabled={list.length === 0}>
          <Download className="w-3 h-3 mr-1" />Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportRows("pdf")} disabled={list.length === 0}>
          <Download className="w-3 h-3 mr-1" />PDF
        </Button>
      </div>
    </div>
  );
}

function GradesPanel({ yearId, yearLabel }: { yearId: string; yearLabel: string }) {
  const { t } = useI18n();
  const stages = [...STAGE_GROUPS];
  const [stage, setStage] = useState<string>(stages[0]);
  const [grade, setGrade] = useState<string>(GRADES_BY_STAGE[stages[0] as keyof typeof GRADES_BY_STAGE][0]);
  const [subject, setSubject] = useState<string>("");
  const [term, setTerm] = useState<Term>("term_1");
  const [month, setMonth] = useState<string>("");

  const gradesForStage = GRADES_BY_STAGE[stage as keyof typeof GRADES_BY_STAGE] ?? [];
  const showMonth = term === "term_1" || term === "term_2";

  const { data: subjects } = useQuery({
    queryKey: ["yr-subj", stage, grade],
    queryFn: async () =>
      (await (supabase as any).from("subjects").select("id, name")
        .eq("stage_group", stage).eq("grade_level", grade).order("name")).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["yr-stud", yearId, stage, grade],
    queryFn: async () =>
      (await supabase.from("student_enrollments")
        .select("user_id, profiles!student_enrollments_user_id_profiles_fkey(full_name, national_id)")
        .eq("academic_year_id", yearId as never)
        .eq("stage_group", stage as never)
        .eq("grade_level", grade as never)).data ?? [],
  });

  const cellReady = !!subject && (term === "midyear" || term === "final" || month !== "");

  const { data: cellGrades } = useQuery({
    queryKey: ["yr-grades", yearId, subject, term, month],
    enabled: cellReady,
    queryFn: async () => {
      let q = (supabase as any).from("grades")
        .select("student_id, score, max_score")
        .eq("academic_year_id", yearId)
        .eq("subject_id", subject)
        .eq("term", term);
      q = month === "" ? q.is("month", null) : q.eq("month", Number(month));
      return (await q).data ?? [];
    },
  });
  const gMap = new Map<string, { score: number; max_score: number }>(
    (cellGrades ?? []).map((g: any) => [g.student_id, { score: g.score, max_score: g.max_score }]),
  );

  async function fetchScope(): Promise<Row[]> {
    if (!cellReady) return [];
    const rows: Row[] = [];
    const subjName = (subjects ?? []).find((s: any) => s.id === subject)?.name ?? "";
    for (const s of students ?? []) {
      const p = (s as any).profiles;
      const g = gMap.get(s.user_id);
      rows.push({
        name: p?.full_name ?? "",
        national_id: p?.national_id ?? "",
        stage: t(`stage.${stage}`),
        grade: t(`grade.${grade}`),
        subject: subjName,
        term: t(`term.${term}`),
        month: month === "" ? "" : MONTH_LABEL[Number(month)],
        score: g?.score ?? "",
        max_score: g?.max_score ?? "",
      });
    }
    return rows;
  }

  async function fetchAllSchool(): Promise<Row[]> {
    const [{ data: enrolls }, { data: subs }, { data: grades }] = await Promise.all([
      supabase.from("student_enrollments")
        .select("user_id, stage_group, grade_level, profiles!student_enrollments_user_id_profiles_fkey(full_name, national_id)")
        .eq("academic_year_id", yearId as never),
      (supabase as any).from("subjects").select("id, name, stage_group, grade_level"),
      (supabase as any).from("grades").select("student_id, subject_id, term, month, score, max_score").eq("academic_year_id", yearId),
    ]);
    const eMap = new Map((enrolls ?? []).map((e: any) => [e.user_id, e]));
    const sMap = new Map((subs ?? []).map((s: any) => [s.id, s]));
    return ((grades ?? []) as any[]).map((g) => {
      const e: any = eMap.get(g.student_id);
      const p = e?.profiles;
      const su: any = sMap.get(g.subject_id);
      return {
        name: p?.full_name ?? "",
        national_id: p?.national_id ?? "",
        stage: e ? t(`stage.${e.stage_group}`) : "",
        grade: e ? t(`grade.${e.grade_level}`) : "",
        subject: su?.name ?? "",
        term: t(`term.${g.term}`),
        month: g.month == null ? "" : MONTH_LABEL[g.month],
        score: g.score,
        max_score: g.max_score,
      };
    });
  }

  async function exportScope(fmt: "csv" | "xlsx" | "pdf") {
    try {
      const rows = await fetchScope();
      const base = `grades_${yearLabel}_${stage}_${grade}`;
      if (fmt === "csv") downloadCSV(`${base}.csv`, rows);
      else if (fmt === "xlsx") downloadXLSX(`${base}.xlsx`, rows, "Grades");
      else downloadPDF(`${base}.pdf`, `Grades — ${yearLabel} · ${t(`stage.${stage}`)} · ${t(`grade.${grade}`)}`, rows);
    } catch (e) { toast.error(formatSupabaseError(e)); }
  }
  async function exportAll(fmt: "csv" | "xlsx" | "pdf") {
    try {
      const rows = await fetchAllSchool();
      const base = `grades_${yearLabel}_all_school`;
      if (fmt === "csv") downloadCSV(`${base}.csv`, rows);
      else if (fmt === "xlsx") downloadXLSX(`${base}.xlsx`, rows, "Grades");
      else downloadPDF(`${base}.pdf`, `Grades — ${yearLabel} · All school`, rows);
    } catch (e) { toast.error(formatSupabaseError(e)); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div><Label className="text-xs">{t("nav.subjects")}</Label>
          <Select value={stage} onValueChange={(v) => { setStage(v); setGrade(GRADES_BY_STAGE[v as keyof typeof GRADES_BY_STAGE][0]); setSubject(""); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{stages.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Select value={grade} onValueChange={(v) => { setGrade(v); setSubject(""); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Subject" /></SelectTrigger>
          <SelectContent>{(subjects ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={term} onValueChange={(v) => { setTerm(v as Term); setMonth(""); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{TERMS.map((tm) => <SelectItem key={tm} value={tm}>{t(`term.${tm}`)}</SelectItem>)}</SelectContent>
        </Select>
        {showMonth && (
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              {[9,10,11,12,1,2,3,4,5,6].map((m) => <SelectItem key={m} value={String(m)}>{MONTH_LABEL[m]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {!cellReady ? (
        <EmptyState text="Pick a subject, term, and month." />
      ) : (students ?? []).length === 0 ? (
        <EmptyState text={t("common.empty")} />
      ) : (
        <div className="rounded-lg border divide-y">
          {students!.map((s) => {
            const p = (s as any).profiles;
            const g = gMap.get(s.user_id);
            return (
              <div key={s.user_id} className="p-3 flex items-center justify-between gap-3">
                <div className="truncate">{p?.full_name ?? "—"}</div>
                {g ? (
                  <Badge variant={g.score < g.max_score / 2 ? "destructive" : "secondary"} className="font-serif text-base px-3 py-1">
                    {g.score}/{g.max_score}
                  </Badge>
                ) : <span className="text-sm text-muted-foreground">—</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <div className="text-sm font-medium w-full">Export</div>
        <Button size="sm" variant="outline" onClick={() => exportScope("csv")} disabled={!cellReady}>
          <Download className="w-3 h-3 mr-1" />This selection · CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportScope("xlsx")} disabled={!cellReady}>
          <Download className="w-3 h-3 mr-1" />This selection · Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportScope("pdf")} disabled={!cellReady}>
          <Download className="w-3 h-3 mr-1" />This selection · PDF
        </Button>
        <Button size="sm" onClick={() => exportAll("csv")}>
          <Download className="w-3 h-3 mr-1" />All school · CSV
        </Button>
        <Button size="sm" onClick={() => exportAll("xlsx")}>
          <Download className="w-3 h-3 mr-1" />All school · Excel
        </Button>
        <Button size="sm" onClick={() => exportAll("pdf")}>
          <Download className="w-3 h-3 mr-1" />All school · PDF
        </Button>
      </div>
    </div>
  );
}

function AttendancePanel({ yearId, yearLabel }: { yearId: string; yearLabel: string }) {
  const { t } = useI18n();
  const stages = [...STAGE_GROUPS];
  const [stage, setStage] = useState<string>(stages[0]);
  const [grade, setGrade] = useState<string>(GRADES_BY_STAGE[stages[0] as keyof typeof GRADES_BY_STAGE][0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const gradesForStage = GRADES_BY_STAGE[stage as keyof typeof GRADES_BY_STAGE] ?? [];

  const { data: students } = useQuery({
    queryKey: ["yr-att-stud", yearId, stage, grade],
    queryFn: async () =>
      (await supabase.from("student_enrollments")
        .select("user_id, profiles!student_enrollments_user_id_profiles_fkey(full_name, national_id)")
        .eq("academic_year_id", yearId as never)
        .eq("stage_group", stage as never)
        .eq("grade_level", grade as never)).data ?? [],
  });

  const { data: recs } = useQuery({
    queryKey: ["yr-att-recs", yearId, date],
    queryFn: async () =>
      (await supabase.from("attendance").select("student_id, status").eq("academic_year_id", yearId as never).eq("date", date)).data ?? [],
  });
  const aMap = useMemo(() => new Map((recs ?? []).map((r: any) => [r.student_id, r.status])), [recs]);

  async function fetchScope(): Promise<Row[]> {
    const ids = (students ?? []).map((s: any) => s.user_id);
    if (ids.length === 0) return [];
    const { data: att } = await supabase.from("attendance").select("*").eq("academic_year_id", yearId as never).in("student_id", ids);
    const pMap = new Map((students ?? []).map((s: any) => [s.user_id, s.profiles]));
    return ((att ?? []) as any[]).map((a) => ({
      name: (pMap.get(a.student_id) as any)?.full_name ?? "",
      national_id: (pMap.get(a.student_id) as any)?.national_id ?? "",
      stage: t(`stage.${stage}`),
      grade: t(`grade.${grade}`),
      date: a.date,
      status: a.status,
    }));
  }

  async function fetchAllSchool(): Promise<Row[]> {
    const [{ data: enrolls }, { data: att }] = await Promise.all([
      supabase.from("student_enrollments")
        .select("user_id, stage_group, grade_level, profiles!student_enrollments_user_id_profiles_fkey(full_name, national_id)")
        .eq("academic_year_id", yearId as never),
      supabase.from("attendance").select("*").eq("academic_year_id", yearId as never),
    ]);
    const eMap = new Map((enrolls ?? []).map((e: any) => [e.user_id, e]));
    return ((att ?? []) as any[]).map((a) => {
      const e: any = eMap.get(a.student_id);
      const p = e?.profiles;
      return {
        name: p?.full_name ?? "",
        national_id: p?.national_id ?? "",
        stage: e ? t(`stage.${e.stage_group}`) : "",
        grade: e ? t(`grade.${e.grade_level}`) : "",
        date: a.date,
        status: a.status,
      };
    });
  }

  async function exportScope(fmt: "csv" | "xlsx" | "pdf") {
    try {
      const rows = await fetchScope();
      const base = `attendance_${yearLabel}_${stage}_${grade}`;
      if (fmt === "csv") downloadCSV(`${base}.csv`, rows);
      else if (fmt === "xlsx") downloadXLSX(`${base}.xlsx`, rows, "Attendance");
      else downloadPDF(`${base}.pdf`, `Attendance — ${yearLabel} · ${t(`stage.${stage}`)} · ${t(`grade.${grade}`)}`, rows);
    } catch (e) { toast.error(formatSupabaseError(e)); }
  }
  async function exportAll(fmt: "csv" | "xlsx" | "pdf") {
    try {
      const rows = await fetchAllSchool();
      const base = `attendance_${yearLabel}_all_school`;
      if (fmt === "csv") downloadCSV(`${base}.csv`, rows);
      else if (fmt === "xlsx") downloadXLSX(`${base}.xlsx`, rows, "Attendance");
      else downloadPDF(`${base}.pdf`, `Attendance — ${yearLabel} · All school`, rows);
    } catch (e) { toast.error(formatSupabaseError(e)); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <Select value={stage} onValueChange={(v) => { setStage(v); setGrade(GRADES_BY_STAGE[v as keyof typeof GRADES_BY_STAGE][0]); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{stages.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {(students ?? []).length === 0 ? (
        <EmptyState text={t("common.empty")} />
      ) : (
        <div className="rounded-lg border divide-y">
          {students!.map((s) => {
            const p = (s as any).profiles;
            const status = aMap.get(s.user_id);
            return (
              <div key={s.user_id} className="p-3 flex items-center justify-between gap-3">
                <div className="truncate">{p?.full_name ?? "—"}</div>
                {status ? (
                  <Badge variant={status === "present" ? "secondary" : status === "late" ? "outline" : "destructive"}>
                    {t(`attendance.${status}`)}
                  </Badge>
                ) : <span className="text-sm text-muted-foreground">—</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <div className="text-sm font-medium w-full">Export</div>
        <Button size="sm" variant="outline" onClick={() => exportScope("csv")}>
          <Download className="w-3 h-3 mr-1" />This stage/grade · CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportScope("xlsx")}>
          <Download className="w-3 h-3 mr-1" />This stage/grade · Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportScope("pdf")}>
          <Download className="w-3 h-3 mr-1" />This stage/grade · PDF
        </Button>
        <Button size="sm" onClick={() => exportAll("csv")}>
          <Download className="w-3 h-3 mr-1" />All school · CSV
        </Button>
        <Button size="sm" onClick={() => exportAll("xlsx")}>
          <Download className="w-3 h-3 mr-1" />All school · Excel
        </Button>
        <Button size="sm" onClick={() => exportAll("pdf")}>
          <Download className="w-3 h-3 mr-1" />All school · PDF
        </Button>
      </div>
    </div>
  );
}
