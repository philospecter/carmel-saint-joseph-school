import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, stageGroupForGrade } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useMe } from "@/hooks/use-me";
import { useState } from "react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";
import { FilePicker } from "@/components/files/FilePicker";
import { Attachments } from "@/components/files/Attachments";
import { attachFile } from "@/lib/files";

export const Route = createFileRoute("/_authenticated/teacher/subject/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();

  const { data: assignment } = useQuery({
    queryKey: ["ta", id],
    queryFn: async () => (await supabase.from("teacher_assignments").select("id, subjects(id, name, grade_level)").eq("id", id).maybeSingle()).data,
  });
  const subject = (assignment as { subjects?: { name: string; grade_level: string } } | null)?.subjects;

  const { data: announcements } = useQuery({
    queryKey: ["t-ann", id],
    queryFn: async () => (await supabase.from("announcements").select("*").eq("teacher_assignment_id", id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: homework } = useQuery({
    queryKey: ["t-hw", id],
    queryFn: async () => (await supabase.from("homework").select("*").eq("teacher_assignment_id", id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: banks } = useQuery({
    queryKey: ["t-banks", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => (await supabase.from("question_banks").select("*").eq("teacher_id", me!.userId).order("created_at", { ascending: false })).data ?? [],
  });

  const [annT, setAnnT] = useState("");
  const [annB, setAnnB] = useState("");
  async function postAnn() {
    if (!annT || !annB || !me) return;
    const { error } = await supabase.from("announcements").insert({
      author_id: me.userId,
      scope: "subject",
      teacher_assignment_id: id,
      title: annT,
      body: annB,
    });
    if (error) return toast.error(formatSupabaseError(error));
    setAnnT(""); setAnnB("");
    qc.invalidateQueries({ queryKey: ["t-ann", id] });
    toast.success("Posted");
  }

  const [hw, setHw] = useState({ title: "", body: "", due_at: "", auto_lock: true, kind: "simple" as "simple" | "bank", bank_id: "", link_url: "" });
  const [selectedQIds, setSelectedQIds] = useState<Set<string>>(new Set());
  const [hwFile, setHwFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { data: bankQuestions } = useQuery({
    queryKey: ["bank-questions-for-hw", hw.bank_id],
    enabled: hw.kind === "bank" && !!hw.bank_id,
    queryFn: async () => (await supabase.from("questions").select("id, prompt, type, points").eq("bank_id", hw.bank_id).order("created_at")).data ?? [],
  });

  async function createHw() {
    if (!hw.title) return;
    if (hw.kind === "simple" && hw.link_url) {
      try { new URL(hw.link_url); } catch { return toast.error("Please enter a valid URL."); }
    }
    if (hw.kind === "bank" && (!hw.bank_id || selectedQIds.size === 0)) {
      return toast.error("Pick a bank and select at least one question.");
    }
    const payload: Record<string, unknown> = {
      teacher_assignment_id: id,
      title: hw.title,
      body: hw.body || null,
      kind: hw.kind,
      auto_lock: hw.auto_lock,
      due_at: hw.due_at ? new Date(hw.due_at).toISOString() : null,
      link_url: hw.kind === "simple" ? (hw.link_url || null) : null,
    };
    if (hw.kind === "bank" && hw.bank_id) payload.bank_id = hw.bank_id;
    const { data, error } = await supabase.from("homework").insert(payload as never).select().single();
    if (error) return toast.error(formatSupabaseError(error));
    if (hw.kind === "bank" && hw.bank_id && selectedQIds.size > 0) {
      const rows = Array.from(selectedQIds).map((qid, i) => ({ homework_id: data.id, question_id: qid, order: i }));
      const { error: insErr } = await supabase.from("homework_questions").insert(rows);
      if (insErr) return toast.error(formatSupabaseError(insErr));
    }
    if (hwFile && me) {
      setUploading(true);
      try {
        await attachFile(hwFile, {
          category: "homework",
          homework_id: data.id,
          uploaded_by: me.userId,
          stage_group: subject ? stageGroupForGrade(subject.grade_level) : null,
          grade_level: subject?.grade_level ?? null,
        });
      } catch (e) {
        setUploading(false);
        return toast.error(e instanceof Error ? e.message : "Upload failed.");
      }
      setUploading(false);
    }
    setHw({ title: "", body: "", due_at: "", auto_lock: true, kind: "simple", bank_id: "", link_url: "" });
    setSelectedQIds(new Set());
    setHwFile(null);
    qc.invalidateQueries({ queryKey: ["t-hw", id] });
    qc.invalidateQueries({ queryKey: ["attachments"] });
    toast.success("Created");
  }

  async function toggleLock(hid: string, locked: boolean) {
    const { error } = await supabase.from("homework").update({ locked: !locked }).eq("id", hid);
    if (error) return toast.error(formatSupabaseError(error));
    qc.invalidateQueries({ queryKey: ["t-hw", id] });
  }

  return (
    <Section title={subject ? `${subject.name} — ${t(`grade.${subject.grade_level}`)}` : ""} action={<Link to="/teacher" className="text-sm text-muted-foreground">← {t("common.back")}</Link>}>
      <Tabs defaultValue="hw">
        <TabsList>
          <TabsTrigger value="hw">Homework</TabsTrigger>
          <TabsTrigger value="ann">{t("nav.announcements")}</TabsTrigger>
        </TabsList>

        <TabsContent value="hw" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">New homework</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>{t("common.title")}</Label><Input value={hw.title} onChange={(e) => setHw({ ...hw, title: e.target.value })} /></div>
                <div><Label>{t("common.due")}</Label><Input type="datetime-local" value={hw.due_at} onChange={(e) => setHw({ ...hw, due_at: e.target.value })} /></div>
              </div>
              <div><Label>{t("common.body")}</Label><Textarea rows={3} value={hw.body} onChange={(e) => setHw({ ...hw, body: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2 items-end">
                <div>
                  <Label>Type</Label>
                  <Select value={hw.kind} onValueChange={(v) => setHw({ ...hw, kind: v as "simple" | "bank" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="simple">Simple</SelectItem><SelectItem value="bank">From Question Bank</SelectItem></SelectContent>
                  </Select>
                </div>
                {hw.kind === "bank" && (
                  <div>
                    <Label>Bank</Label>
                    <Select value={hw.bank_id} onValueChange={(v) => setHw({ ...hw, bank_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>{(banks ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {hw.kind === "simple" && (
                <div>
                  <Label>{t("homework.link_url")}</Label>
                  <Input type="url" placeholder="https://drive.google.com/…" value={hw.link_url} onChange={(e) => setHw({ ...hw, link_url: e.target.value })} />
                </div>
              )}
              {hw.kind === "bank" && hw.bank_id && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">{t("homework.select_questions")}</div>
                  {(bankQuestions ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("homework.no_questions")}</div>
                  ) : (
                    (bankQuestions ?? []).map((q) => (
                      <label key={q.id} className="flex items-start gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={selectedQIds.has(q.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selectedQIds);
                            if (v) next.add(q.id); else next.delete(q.id);
                            setSelectedQIds(next);
                          }}
                        />
                        <span className="flex-1">
                          <Badge variant="secondary" className="mr-2 text-xs">{q.type}</Badge>
                          {q.prompt}
                          <span className="text-xs text-muted-foreground ml-2">({q.points} pts)</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={hw.auto_lock} onCheckedChange={(v) => setHw({ ...hw, auto_lock: !!v })} />
                Auto-lock at due date
              </label>
              <FilePicker file={hwFile} onChange={setHwFile} disabled={uploading} />
              <Button onClick={createHw} disabled={uploading}>{uploading ? "Uploading…" : t("common.create")}</Button>
            </CardContent>
          </Card>

          {(homework ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : homework!.map((h) => (
            <Card key={h.id}>
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <div className="flex items-center gap-2"><CardTitle className="text-base">{h.title}</CardTitle>{h.locked && <Badge variant="secondary">Closed</Badge>}{h.kind === "bank" && <Badge>Quiz</Badge>}</div>
                <div className="flex items-center gap-2">
                  {h.kind === "bank" && (
                    <Link to="/teacher/homework/$id" params={{ id: h.id }} className="text-sm text-primary underline">
                      {t("homework.view_submissions")}
                    </Link>
                  )}
                  <Button size="sm" variant="outline" onClick={() => toggleLock(h.id, h.locked)}>{h.locked ? "Reopen" : t("common.close")}</Button>
                </div>
              </CardHeader>
              <CardContent>
                {h.body && <p className="text-sm whitespace-pre-wrap">{h.body}</p>}
                {h.due_at && <div className="text-xs text-muted-foreground mt-1">Due {new Date(h.due_at).toLocaleString()}</div>}
                <Attachments homeworkId={h.id} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="ann" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Post announcement</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder={t("common.title")} value={annT} onChange={(e) => setAnnT(e.target.value)} />
              <Textarea rows={3} placeholder={t("common.body")} value={annB} onChange={(e) => setAnnB(e.target.value)} />
              <Button onClick={postAnn}>{t("common.create")}</Button>
            </CardContent>
          </Card>
          {(announcements ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : announcements!.map((a) => (
            <Card key={a.id}><CardHeader><CardTitle className="text-base">{a.title}</CardTitle></CardHeader><CardContent><p className="text-sm whitespace-pre-wrap">{a.body}</p><Attachments announcementId={a.id} /></CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>
    </Section>
  );
}
