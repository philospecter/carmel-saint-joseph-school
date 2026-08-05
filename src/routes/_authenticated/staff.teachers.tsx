import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, STAGE_GROUPS, GRADES_BY_STAGE } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { useMe } from "@/hooks/use-me";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";
import { createStaffAccount, assignTeacherSubject, removeTeacherSubject } from "@/lib/auth.functions";
import { useServerFn } from "@tanstack/react-start";
import { getTeacherActivity } from "@/lib/teacher-activity.functions";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { useCurrentYearId } from "@/lib/rosters";

export const Route = createFileRoute("/_authenticated/staff/teachers")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isAdmin = !!me?.roles.includes("admin");
  const [search, setSearch] = useState("");

  const { data: teachers } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "teacher");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from("profiles").select("*").in("id", ids).order("full_name");
      return data ?? [];
    },
  });

  const filtered = (teachers ?? []).filter((t) => t.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Section title={t("nav.teachers")} action={isAdmin ? <CreateTeacherDialog onDone={() => qc.invalidateQueries({ queryKey: ["teachers"] })} /> : null}>
      <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      <div className="space-y-3">
        {filtered.length === 0 ? <EmptyState text={t("common.empty")} /> : filtered.map((tc) => <TeacherCard key={tc.id} teacher={tc} />)}
      </div>
    </Section>
  );
}

function CreateTeacherDialog({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", mobile: "", address: "", password: "" });
  async function submit() {
    try {
      await createStaffAccount({ data: { kind: "teacher", ...form } });
      toast.success("Teacher created");
      setForm({ full_name: "", email: "", mobile: "", address: "", password: "" });
      setOpen(false);
      onDone();
    } catch (e) { toast.error(formatSupabaseError(e)); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>+ Teacher</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New teacher</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("auth.full_name")}</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>{t("auth.mobile")}</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><Label>{t("auth.address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>{t("auth.password")}</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <Button onClick={submit}>{t("common.create")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeacherCard({ teacher }: { teacher: { id: string; full_name: string; email: string | null; mobile: string | null } }) {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isAdmin = !!me?.roles.includes("admin");
  const myStages = new Set(me?.stages ?? []);
  const { data: currentYearId } = useCurrentYearId();

  const { data: assignments } = useQuery({
    queryKey: ["teacher-asg", teacher.id, currentYearId],
    enabled: !!currentYearId,
    queryFn: async () => (await supabase.from("teacher_assignments").select("id, subject_id, subjects(id, name, stage_group, grade_level)").eq("teacher_id", teacher.id).eq("academic_year_id", currentYearId!)).data ?? [],
  });

  const [stage, setStage] = useState<string>("");
  const [grade, setGrade] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const { data: subjects } = useQuery({
    queryKey: ["asg-subjects", stage, grade],
    enabled: !!stage && !!grade,
    queryFn: async () => (await supabase.from("subjects").select("*").eq("stage_group", stage as never).eq("grade_level", grade as never).order("name")).data ?? [],
  });

  async function addAsg() {
    if (!subjectId) return;
    try { await assignTeacherSubject({ data: { teacherId: teacher.id, subjectId } }); toast.success("Assigned"); setSubjectId(""); qc.invalidateQueries({ queryKey: ["teacher-asg", teacher.id] }); }
    catch (e) { toast.error(formatSupabaseError(e)); }
  }
  async function removeAsg(id: string) {
    try { await removeTeacherSubject({ data: { assignmentId: id } }); qc.invalidateQueries({ queryKey: ["teacher-asg", teacher.id] }); } catch (e) { toast.error(formatSupabaseError(e)); }
  }

  const availStages = isAdmin ? [...STAGE_GROUPS] : [...myStages];
  const gradesForStage = stage ? GRADES_BY_STAGE[stage as keyof typeof GRADES_BY_STAGE] ?? [] : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{teacher.full_name}</CardTitle>
            <div className="text-xs text-muted-foreground">{teacher.email} · {teacher.mobile}</div>
          </div>
          {isAdmin && <TeacherActivityDialog teacherId={teacher.id} teacherName={teacher.full_name} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(assignments ?? []).map((a) => {
            const s = (a as unknown as { subjects: { name: string; stage_group: string; grade_level: string } }).subjects;
            const canRemove = isAdmin || myStages.has(s.stage_group as never);
            return (
              <div key={a.id} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                <span>{s.name} — {t(`grade.${s.grade_level}`)}</span>
                {canRemove && <button className="text-muted-foreground hover:text-destructive" onClick={() => removeAsg(a.id)}>×</button>}
              </div>
            );
          })}
          {(assignments ?? []).length === 0 && <span className="text-xs text-muted-foreground">No subjects yet</span>}
        </div>
        <div className="flex flex-wrap gap-2 items-end pt-2 border-t">
          <div><Label className="text-xs">Stage</Label>
            <Select value={stage} onValueChange={(v) => { setStage(v); setGrade(""); setSubjectId(""); }}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>{availStages.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Grade</Label>
            <Select value={grade} onValueChange={(v) => { setGrade(v); setSubjectId(""); }}>
              <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Grade" /></SelectTrigger>
              <SelectContent>{gradesForStage.map((g) => <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Subject" /></SelectTrigger>
              <SelectContent>{(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={addAsg}>Assign</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TeacherActivityDialog({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const fetchActivity = useServerFn(getTeacherActivity);
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-activity", teacherId],
    enabled: open,
    queryFn: () => fetchActivity({ data: { teacher_id: teacherId } }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Activity className="h-3.5 w-3.5 mr-1" />
          View activity
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{teacherName} — activity this year</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="text-sm font-medium mb-2">Assignments ({data.assignments.length})</div>
              {data.assignments.length === 0 ? (
                <div className="text-xs text-muted-foreground">No subjects assigned this year.</div>
              ) : (
                <div className="rounded-md border divide-y">
                  {data.assignments.map((a) => (
                    <div key={a.id} className="p-2 text-sm flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate">{a.subject_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(`stage.${a.stage_group}`)} · {t(`grade.${a.grade_level}`)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-xs">HW {a.homework_count}</Badge>
                        <Badge variant="secondary" className="text-xs">Grades {a.grades_entered}</Badge>
                        {a.grades_pending > 0 && (
                          <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600">
                            {a.grades_pending} pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Homework ({data.homework.length})</div>
              {data.homework.length === 0 ? (
                <div className="text-xs text-muted-foreground">No homework given this year.</div>
              ) : (
                <div className="rounded-md border divide-y">
                  {data.homework.map((h) => (
                    <div key={h.id} className="p-2 text-sm flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate">{h.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {h.subject_name} · {t(`grade.${h.grade_level}`)} ·{" "}
                          {new Date(h.created_at).toLocaleDateString()}
                          {h.due_at ? ` · due ${new Date(h.due_at).toLocaleDateString()}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">{h.kind}</Badge>
                        <Badge variant="secondary" className="text-xs">{h.submission_count} sub</Badge>
                        {h.locked && <Badge variant="outline" className="text-xs">Locked</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
