import { createFileRoute } from "@tanstack/react-router";
import { useI18n, STAGE_GROUPS, GRADES_BY_STAGE } from "@/lib/i18n";
import { Section } from "@/components/portal/PortalShell";
import { useMe } from "@/hooks/use-me";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";
import { useCurrentYearId } from "@/lib/rosters";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/staff/export")({ component: Page });

type Row = Record<string, string | number>;

function toCSV(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function downloadCSV(name: string, rows: Row[]) {
  downloadBlob(name, new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }));
}
function downloadXLSX(name: string, rows: Row[], sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, name);
}
function downloadPDF(name: string, title: string, rows: Row[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.text("No data.", 14, 24);
  } else {
    const columns = Object.keys(rows[0]);
    autoTable(doc, {
      startY: 20,
      head: [columns],
      body: rows.map((r) => columns.map((c) => String(r[c] ?? ""))),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [70, 70, 70] },
    });
  }
  doc.save(name);
}

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const { data: currentYearId } = useCurrentYearId();
  const isAdmin = !!me?.roles.includes("admin");
  const stages = isAdmin ? [...STAGE_GROUPS] : me?.stages ?? [];
  const [stage, setStage] = useState<string>(stages[0] ?? "primary_1_2");
  const [grade, setGrade] = useState<string>(GRADES_BY_STAGE[(stages[0] ?? "primary_1_2") as keyof typeof GRADES_BY_STAGE][0]);

  async function fetchAttendance(): Promise<Row[]> {
    const { data: enrolls } = await supabase.from("student_enrollments").select("user_id").eq("stage_group", stage as never).eq("grade_level", grade as never);
    const ids = (enrolls ?? []).map((e) => e.user_id);
    if (ids.length === 0) { toast.info("No students"); return []; }
    const [{ data: profs }, { data: att }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, national_id").in("id", ids),
      supabase.from("attendance").select("*").in("student_id", ids),
    ]);
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    return (att ?? []).map((a) => ({
      name: pMap.get(a.student_id)?.full_name ?? "",
      national_id: pMap.get(a.student_id)?.national_id ?? "",
      date: a.date,
      status: a.status,
    }));
  }

  async function fetchGrades(): Promise<Row[]> {
    const { data: enrolls } = await supabase.from("student_enrollments").select("user_id").eq("stage_group", stage as never).eq("grade_level", grade as never);
    const ids = (enrolls ?? []).map((e) => e.user_id);
    if (ids.length === 0) { toast.info("No students"); return []; }
    const [{ data: profs }, { data: subs }, { data: grades }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, national_id").in("id", ids),
      supabase.from("subjects").select("*").eq("stage_group", stage as never).eq("grade_level", grade as never),
      (supabase as any).from("grades").select("*").in("student_id", ids),
    ]);
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const sMap = new Map((subs ?? []).map((s) => [s.id, s]));
    return ((grades ?? []) as any[]).map((g) => ({
      name: pMap.get(g.student_id)?.full_name ?? "",
      national_id: pMap.get(g.student_id)?.national_id ?? "",
      subject: sMap.get(g.subject_id)?.name ?? "",
      term: g.term,
      month: g.month ?? "",
      score: g.score,
      max_score: g.max_score,
    }));
  }

  async function run(kind: "attendance" | "grades", fmt: "csv" | "xlsx" | "pdf") {
    try {
      const rows = kind === "attendance" ? await fetchAttendance() : await fetchGrades();
      if (rows.length === 0) return;
      const base = `${kind}_${stage}_${grade}`;
      const title = `${kind === "attendance" ? "Attendance" : "Grades"} — ${t(`stage.${stage}`)} · ${t(`grade.${grade}`)}`;
      if (fmt === "csv") downloadCSV(`${base}.csv`, rows);
      else if (fmt === "xlsx") downloadXLSX(`${base}.xlsx`, rows, kind);
      else downloadPDF(`${base}.pdf`, title, rows);
    } catch (e) {
      toast.error(formatSupabaseError(e));
    }
  }

  const gradesForStage = GRADES_BY_STAGE[stage as keyof typeof GRADES_BY_STAGE] ?? [];

  return (
    <Section title={t("nav.export")}>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("export.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div><Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => { setStage(v); setGrade(GRADES_BY_STAGE[v as keyof typeof GRADES_BY_STAGE][0]); }}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{stages.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Grade</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t("export.attendance")}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => run("attendance", "csv")}>CSV</Button>
              <Button size="sm" variant="outline" onClick={() => run("attendance", "xlsx")}>Excel</Button>
              <Button size="sm" variant="outline" onClick={() => run("attendance", "pdf")}>PDF</Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t("export.grades")}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => run("grades", "csv")}>CSV</Button>
              <Button size="sm" variant="outline" onClick={() => run("grades", "xlsx")}>Excel</Button>
              <Button size="sm" variant="outline" onClick={() => run("grades", "pdf")}>PDF</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}
