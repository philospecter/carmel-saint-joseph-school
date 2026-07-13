import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/teacher/banks")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const { data: banks } = useQuery({
    queryKey: ["banks", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => (await supabase.from("question_banks").select("*").eq("teacher_id", me!.userId).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: questions } = useQuery({
    queryKey: ["bank-qs", selected],
    enabled: !!selected,
    queryFn: async () => (await supabase.from("questions").select("*").eq("bank_id", selected!).order("created_at")).data ?? [],
  });

  async function createBank() {
    if (!newName || !me) return;
    const { error } = await supabase.from("question_banks").insert({ name: newName, teacher_id: me.userId });
    if (error) return toast.error(formatSupabaseError(error));
    setNewName("");
    qc.invalidateQueries({ queryKey: ["banks"] });
  }

  return (
    <Section title={t("nav.question_banks")}>
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-base">Banks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Name…" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button size="icon" onClick={createBank} aria-label="Create bank">+</Button>
            </div>
            <div className="space-y-1 pt-1">
              {(banks ?? []).map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className={`block w-full text-start rounded-md px-3 py-2 text-sm truncate transition-colors ${selected === b.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                >
                  {b.name}
                </button>
              ))}
              {(banks ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground px-1 py-2">No banks yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="min-w-0">
          {selected ? <BankEditor bankId={selected} questions={questions ?? []} /> : <EmptyState text="Select or create a bank" />}
        </div>
      </div>
    </Section>
  );
}

function BankEditor({ bankId, questions }: { bankId: string; questions: Array<{ id: string; prompt: string; type: string; choices: unknown; correct_choice: number | null; points: number }> }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState({ type: "mcq" as "mcq" | "written", prompt: "", choices: ["", "", "", ""], correct: 0, points: 1 });

  async function addQ() {
    if (!q.prompt.trim()) return;
    if (q.type === "mcq") {
      const filled = q.choices.filter((c) => c.trim());
      if (filled.length < 2) return toast.error("At least 2 choices required.");
      if (!q.choices[q.correct]?.trim()) return toast.error("Mark the correct choice.");
    }
    const payload: Record<string, unknown> = { bank_id: bankId, prompt: q.prompt, type: q.type, points: q.points };
    if (q.type === "mcq") { payload.choices = q.choices; payload.correct_choice = q.correct; }
    const { error } = await supabase.from("questions").insert(payload as never);
    if (error) return toast.error(formatSupabaseError(error));
    setQ({ type: "mcq", prompt: "", choices: ["", "", "", ""], correct: 0, points: 1 });
    qc.invalidateQueries({ queryKey: ["bank-qs", bankId] });
  }
  async function delQ(id: string) {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) return toast.error(formatSupabaseError(error));
    qc.invalidateQueries({ queryKey: ["bank-qs", bankId] });
  }
  function setChoice(i: number, val: string) {
    setQ({ ...q, choices: q.choices.map((x, xi) => (xi === i ? val : x)) });
  }
  function addChoice() {
    if (q.choices.length >= 6) return;
    setQ({ ...q, choices: [...q.choices, ""] });
  }
  function removeChoice(i: number) {
    if (q.choices.length <= 2) return;
    const next = q.choices.filter((_, xi) => xi !== i);
    setQ({ ...q, choices: next, correct: Math.min(q.correct, next.length - 1) });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Add question</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Type toggle */}
          <div className="inline-flex rounded-md border p-1 bg-secondary/40">
            <button
              type="button"
              onClick={() => setQ({ ...q, type: "mcq" })}
              className={`px-3 py-1.5 text-sm rounded ${q.type === "mcq" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              {t("banks.type_mcq")}
            </button>
            <button
              type="button"
              onClick={() => setQ({ ...q, type: "written" })}
              className={`px-3 py-1.5 text-sm rounded ${q.type === "written" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              {t("banks.type_written")}
            </button>
          </div>

          <div className="space-y-1.5">
            <Label>Prompt</Label>
            <Textarea rows={3} value={q.prompt} onChange={(e) => setQ({ ...q, prompt: e.target.value })} />
          </div>

          <div className="w-28 space-y-1.5">
            <Label>Points</Label>
            <Input type="number" min={1} value={q.points} onChange={(e) => setQ({ ...q, points: Number(e.target.value) || 1 })} />
          </div>

          {q.type === "mcq" && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Choices</Label>
              <div className="space-y-2">
                {q.choices.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
                    <span className="w-6 shrink-0 text-sm font-mono text-muted-foreground text-center">{String.fromCharCode(65 + i)}</span>
                    <Input
                      className="flex-1 min-w-[140px]"
                      placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                      value={c}
                      onChange={(e) => setChoice(i, e.target.value)}
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap shrink-0 text-muted-foreground">
                      <input type="radio" name="correct" checked={q.correct === i} onChange={() => setQ({ ...q, correct: i })} />
                      {t("banks.mark_correct")}
                    </label>
                    <button
                      type="button"
                      onClick={() => removeChoice(i)}
                      disabled={q.choices.length <= 2}
                      className="shrink-0 h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:hover:bg-transparent text-lg leading-none"
                      aria-label="Remove choice"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {q.choices.length < 6 && (
                <Button type="button" size="sm" variant="ghost" onClick={addChoice}>+ {t("banks.add_choice")}</Button>
              )}
            </div>
          )}

          <Button onClick={addQ} className="w-full sm:w-auto">Add question</Button>
        </CardContent>
      </Card>

      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t("banks.preview")}</CardTitle></CardHeader>
          <CardContent>
            {q.prompt.trim() ? (
              <div className="space-y-3">
                <div className="text-sm whitespace-pre-wrap break-words">
                  {q.prompt} <span className="text-xs text-muted-foreground">({q.points} pts)</span>
                </div>
                {q.type === "mcq" ? (
                  <ul className="space-y-1.5">
                    {q.choices.filter((c) => c.trim()).map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-full border text-xs font-mono">{String.fromCharCode(65 + i)}</span>
                        <span className="break-words min-w-0">{c}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded border border-dashed p-3 text-sm text-muted-foreground italic">Student writes an answer here…</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Start typing to see the preview.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Existing questions ({questions.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {questions.length === 0 ? (
              <div className="text-sm text-muted-foreground">No questions yet.</div>
            ) : questions.map((qq) => (
              <div key={qq.id} className="flex justify-between items-start gap-2 border rounded-md p-2">
                <div className="text-sm flex-1 min-w-0 break-words"><LocalBadge>{qq.type}</LocalBadge>{qq.prompt}</div>
                <Button size="sm" variant="ghost" onClick={() => delQ(qq.id)} aria-label="Delete question">×</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LocalBadge({ children }: { children: React.ReactNode }) {
  return <span className="text-xs bg-secondary rounded px-2 py-0.5 mr-2">{children}</span>;
}


