import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMe } from "@/hooks/use-me";
import { useI18n, STAGE_GROUPS, GRADES_BY_STAGE } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { formatSupabaseError } from "@/lib/errors";
import { listSubjectsAdmin, createSubjects, updateSubject, deleteSubject } from "@/lib/subjects.functions";

export const Route = createFileRoute("/_authenticated/staff/subjects")({ component: Page });

type StageGroup = (typeof STAGE_GROUPS)[number];
type Row = {
  id: string;
  name: string;
  stage_group: StageGroup;
  grade_level: string;
  ref_counts: { teachers: number; homework: number; grades: number };
};

function fmt(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const isAdmin = !!me?.roles.includes("admin");
  const qc = useQueryClient();
  const list = useServerFn(listSubjectsAdmin);
  const { data } = useQuery({
    queryKey: ["admin-subjects"],
    queryFn: () => list(),
    enabled: isAdmin,
  });
  const [stage, setStage] = useState<string>("all");
  const [grade, setGrade] = useState<string>("all");

  if (!isAdmin) return <div className="p-8">Not authorized.</div>;

  const rows = (data ?? []) as Row[];
  const filtered = rows.filter((r) => (stage === "all" || r.stage_group === stage) && (grade === "all" || r.grade_level === grade));

  const groups = new Map<string, Map<string, Row[]>>();
  for (const r of filtered) {
    if (!groups.has(r.stage_group)) groups.set(r.stage_group, new Map());
    const g = groups.get(r.stage_group)!;
    if (!g.has(r.grade_level)) g.set(r.grade_level, []);
    g.get(r.grade_level)!.push(r);
  }

  const gradesForStage = stage !== "all" ? GRADES_BY_STAGE[stage as StageGroup] ?? [] : [];

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-subjects"] });
    qc.invalidateQueries({ queryKey: ["subj"] });
    qc.invalidateQueries({ queryKey: ["asg-subjects"] });
    qc.invalidateQueries({ queryKey: ["student-subjects"] });
  }

  return (
    <Section title={t("nav.subjects_admin")} action={<AddDialog onDone={refresh} />}>
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={stage} onValueChange={(v) => { setStage(v); setGrade("all"); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("subjects.stage")}</SelectItem>
            {STAGE_GROUPS.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={grade} onValueChange={setGrade} disabled={stage === "all"}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("subjects.grades")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("subjects.grades")}</SelectItem>
            {gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? <EmptyState text={t("common.empty")} /> : (
        <div className="space-y-6">
          {[...groups.entries()].map(([sg, byGrade]) => (
            <div key={sg}>
              <h3 className="font-serif text-lg mb-2">{t(`stage.${sg}`)}</h3>
              <div className="space-y-4">
                {[...byGrade.entries()].map(([gl, items]) => (
                  <div key={gl}>
                    <div className="text-sm font-medium text-muted-foreground mb-1">{t(`grade.${gl}`)}</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((r) => <SubjectRow key={r.id} row={r} onChanged={refresh} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function SubjectRow({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const update = useServerFn(updateSubject);
  const del = useServerFn(deleteSubject);
  const refCount = row.ref_counts.teachers + row.ref_counts.homework + row.ref_counts.grades;
  const canDelete = refCount === 0;

  const updateM = useMutation({
    mutationFn: () => update({ data: { id: row.id, name: name.trim() } }),
    onSuccess: () => { toast.success(t("common.save")); setEditing(false); onChanged(); },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  const deleteM = useMutation({
    mutationFn: () => del({ data: { id: row.id } }),
    onSuccess: () => { toast.success(t("subjects.delete")); onChanged(); },
    onError: (e: unknown) => {
      const err = e as { code?: string; teachers?: number; homework?: number; grades?: number; message?: string };
      if (err?.code === "HAS_REFERENCES") {
        toast.error(fmt(t("subjects.cannot_delete"), {
          teachers: err.teachers ?? 0, homework: err.homework ?? 0, grades: err.grades ?? 0,
        }));
      } else toast.error(formatSupabaseError(e));
    },
  });

  return (
    <Card id={`subject-${row.id}`}>
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{row.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {fmt(t("subjects.references"), row.ref_counts)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Dialog open={editing} onOpenChange={(o) => { setEditing(o); if (o) setName(row.name); }}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("subjects.edit_name")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t("subjects.name")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(`stage.${row.stage_group}`)} · {t(`grade.${row.grade_level}`)}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => updateM.mutate()} disabled={!name.trim() || updateM.isPending}>
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            size="icon"
            variant="ghost"
            disabled={!canDelete || deleteM.isPending}
            title={canDelete ? "" : fmt(t("subjects.cannot_delete"), row.ref_counts)}
            onClick={() => {
              if (!canDelete) return;
              if (confirm(t("subjects.delete_confirm"))) deleteM.mutate();
            }}
          >
            <Trash2 className={`h-4 w-4 ${canDelete ? "text-destructive" : "opacity-40"}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddDialog({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<StageGroup>("primary_1_2");
  const [selected, setSelected] = useState<string[]>([]);
  const create = useServerFn(createSubjects);
  const m = useMutation({
    mutationFn: () => create({ data: { name: name.trim(), stage_group: stage, grade_levels: selected } }),
    onSuccess: (res: { created: number; skipped: string[] }) => {
      toast.success(fmt(t("subjects.created_summary"), { created: res.created, skipped: res.skipped.length }));
      setName(""); setSelected([]); setOpen(false); onDone();
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });
  const gradesForStage = GRADES_BY_STAGE[stage] ?? [];
  const allSelected = gradesForStage.length > 0 && gradesForStage.every((g) => selected.includes(g));
  function toggle(g: string) {
    setSelected((s) => s.includes(g) ? s.filter((x) => x !== g) : [...s, g]);
  }
  function toggleAll() {
    setSelected(allSelected ? [] : [...gradesForStage]);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setName(""); setSelected([]); } }}>
      <DialogTrigger asChild><Button>+ {t("subjects.add")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("subjects.add")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("subjects.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("subjects.stage")}</Label>
            <Select value={stage} onValueChange={(v) => { setStage(v as StageGroup); setSelected([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STAGE_GROUPS.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t("subjects.grades")}</Label>
              <button type="button" className="text-xs underline" onClick={toggleAll}>
                {t("subjects.select_all_grades")}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {gradesForStage.map((g) => (
                <label key={g} className="flex items-center gap-2 rounded border p-2 cursor-pointer">
                  <Checkbox checked={selected.includes(g)} onCheckedChange={() => toggle(g)} />
                  <span className="text-sm">{t(`grade.${g}`)}</span>
                </label>
              ))}
            </div>
            {selected.length === 0 && <div className="text-xs text-muted-foreground mt-1">{t("subjects.no_grade_selected")}</div>}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={!name.trim() || selected.length === 0 || m.isPending}>
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
