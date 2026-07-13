import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { gradeWrittenAnswer } from "@/lib/homework.functions";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/teacher/homework/$id")({ component: Page });

type Submission = {
  id: string;
  student_id: string;
  submitted_at: string;
  auto_score: number | null;
  manual_score: number | null;
  final_score: number | null;
};

type AnswerRow = {
  id: string;
  submission_id: string;
  question_id: string;
  mcq_choice: number | null;
  written_text: string | null;
  is_correct: boolean | null;
  manual_score: number | null;
};

type QuestionRow = {
  question_id: string;
  order: number;
  questions: { id: string; type: "mcq" | "written"; prompt: string; choices: string[] | null; points: number } | null;
};

function Page() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const qc = useQueryClient();
  const grade = useServerFn(gradeWrittenAnswer);

  const { data: hw } = useQuery({
    queryKey: ["t-hw-detail", id],
    queryFn: async () => (await supabase.from("homework").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: questions } = useQuery({
    queryKey: ["t-hw-questions", id],
    enabled: !!hw,
    queryFn: async () => {
      const { data } = await supabase
        .from("homework_questions")
        .select("question_id, order, questions(id, type, prompt, choices, points)")
        .eq("homework_id", id)
        .order("order");
      return (data ?? []) as unknown as QuestionRow[];
    },
  });

  const { data: submissions } = useQuery({
    queryKey: ["t-hw-submissions", id],
    queryFn: async () => {
      const { data: subs } = await supabase
        .from("homework_submissions")
        .select("*")
        .eq("homework_id", id)
        .order("submitted_at", { ascending: false });
      const list = (subs ?? []) as Submission[];
      const ids = list.map((s) => s.student_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string }[] };
      const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      return list.map((s) => ({ ...s, profiles: { full_name: nameById.get(s.student_id) ?? "—" } }));
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? submissions?.[0]?.id ?? null;
  const active = submissions?.find((s) => s.id === activeId) ?? null;

  const { data: answers } = useQuery({
    queryKey: ["t-hw-answers", activeId],
    enabled: !!activeId,
    queryFn: async () =>
      ((await supabase.from("homework_answers").select("*").eq("submission_id", activeId!)).data ?? []) as AnswerRow[],
  });

  const [scores, setScores] = useState<Record<string, string>>({});

  const gradeMutation = useMutation({
    mutationFn: async ({ answer_id, manual_score }: { answer_id: string; manual_score: number }) =>
      grade({ data: { answer_id, manual_score } }),
    onSuccess: () => {
      toast.success(t("homework.saved"));
      qc.invalidateQueries({ queryKey: ["t-hw-submissions", id] });
      qc.invalidateQueries({ queryKey: ["t-hw-answers", activeId] });
    },
    onError: (e: unknown) => toast.error(formatSupabaseError(e)),
  });

  function pendingWritten(sub: Submission): number {
    // best-effort: only meaningful when this sub's answers are loaded
    if (sub.id !== activeId) return sub.final_score === null ? 1 : 0;
    return (answers ?? []).filter(
      (a) => questions?.find((q) => q.questions?.id === a.question_id)?.questions?.type === "written" && a.manual_score === null,
    ).length;
  }

  return (
    <Section
      title={hw ? `${hw.title} — ${t("homework.submissions")}` : ""}
      action={
        <Link to="/teacher" className="text-sm text-muted-foreground">
          ← {t("common.back")}
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("homework.submitters")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(submissions ?? []).length === 0 && <EmptyState text={t("homework.no_submissions")} />}
            {(submissions ?? []).map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left rounded px-2 py-2 text-sm hover:bg-muted ${activeId === s.id ? "bg-muted" : ""}`}
              >
                <div className="font-medium">{s.profiles?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {s.final_score === null ? (
                    <Badge variant="secondary" className="text-xs">{t("homework.pending")}</Badge>
                  ) : (
                    <Badge className="text-xs">{s.final_score}</Badge>
                  )}
                  <span>{new Date(s.submitted_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {!active ? (
            <EmptyState text={t("homework.select_submission")} />
          ) : (
            <>
              <Card>
                <CardContent className="pt-4 text-sm flex flex-wrap gap-4">
                  <div>{t("homework.auto_score")}: <strong>{active.auto_score ?? 0}</strong></div>
                  <div>{t("homework.manual_score")}: <strong>{active.manual_score ?? 0}</strong></div>
                  <div>
                    {t("homework.final_score")}:{" "}
                    {active.final_score === null ? (
                      <Badge variant="secondary">{t("homework.pending_review")} ({pendingWritten(active)})</Badge>
                    ) : (
                      <strong>{active.final_score}</strong>
                    )}
                  </div>
                </CardContent>
              </Card>

              {(questions ?? []).map((q, idx) => {
                const qq = q.questions;
                if (!qq) return null;
                const ans = (answers ?? []).find((a) => a.question_id === qq.id);
                return (
                  <Card key={qq.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{`Q${idx + 1}`}</Badge>
                        <span className="text-xs text-muted-foreground">{qq.points} pts · {qq.type}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm">{qq.prompt}</p>
                      {qq.type === "mcq" ? (
                        <div className="text-sm space-y-1">
                          {(qq.choices ?? []).map((choice, i) => {
                            const picked = ans?.mcq_choice === i;
                            return (
                              <div
                                key={i}
                                className={`rounded border px-2 py-1 flex items-center gap-2 ${
                                  picked && ans?.is_correct ? "border-green-500 bg-green-500/10" : picked ? "border-red-500 bg-red-500/10" : ""
                                }`}
                              >
                                <span className="font-mono text-xs w-5">{String.fromCharCode(65 + i)}.</span>
                                <span className="flex-1">{choice}</span>
                                {picked && (
                                  <span className="text-xs">{ans?.is_correct ? `+${qq.points}` : "0"}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="rounded border bg-muted/30 p-2 text-sm whitespace-pre-wrap">
                            {ans?.written_text || <span className="text-muted-foreground italic">—</span>}
                          </div>
                          {ans && (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={qq.points}
                                step="0.5"
                                className="w-24"
                                placeholder={`0–${qq.points}`}
                                value={scores[ans.id] ?? (ans.manual_score !== null ? String(ans.manual_score) : "")}
                                onChange={(e) => setScores({ ...scores, [ans.id]: e.target.value })}
                              />
                              <span className="text-xs text-muted-foreground">/ {qq.points}</span>
                              <Button
                                size="sm"
                                onClick={() => {
                                  const raw = scores[ans.id] ?? (ans.manual_score !== null ? String(ans.manual_score) : "");
                                  const n = Number(raw);
                                  if (!Number.isFinite(n)) return toast.error("Invalid score");
                                  gradeMutation.mutate({ answer_id: ans.id, manual_score: n });
                                }}
                                disabled={gradeMutation.isPending}
                              >
                                {t("homework.save_grade")}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
