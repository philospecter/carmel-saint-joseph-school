import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { submitHomework } from "@/lib/homework.functions";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";
import { Attachments } from "@/components/files/Attachments";

export const Route = createFileRoute("/_authenticated/student/homework/$id")({ component: Page });

type HwQuestion = {
  question_id: string;
  order: number;
  questions: {
    id: string;
    type: "mcq" | "written";
    prompt: string;
    choices: string[] | null;
    points: number;
  } | null;
};

type AnswerRow = {
  id: string;
  question_id: string;
  mcq_choice: number | null;
  written_text: string | null;
  is_correct: boolean | null;
  manual_score: number | null;
};

function Page() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const submit = useServerFn(submitHomework);

  const { data: hw } = useQuery({
    queryKey: ["hw-detail", id],
    queryFn: async () =>
      (await supabase.from("homework").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: questions } = useQuery({
    queryKey: ["hw-questions", id],
    enabled: !!hw && hw.kind === "bank",
    queryFn: async () => {
      const { data } = await supabase
        .from("homework_questions")
        .select("question_id, order, questions(id, type, prompt, choices, points)")
        .eq("homework_id", id)
        .order("order");
      return (data ?? []) as unknown as HwQuestion[];
    },
  });

  const { data: submission } = useQuery({
    queryKey: ["hw-submission", id, me?.userId],
    enabled: !!me?.userId,
    queryFn: async () =>
      (
        await supabase
          .from("homework_submissions")
          .select("*")
          .eq("homework_id", id)
          .eq("student_id", me!.userId)
          .maybeSingle()
      ).data,
  });

  const { data: answers } = useQuery({
    queryKey: ["hw-answers", submission?.id],
    enabled: !!submission?.id,
    queryFn: async () =>
      ((await supabase.from("homework_answers").select("*").eq("submission_id", submission!.id)).data ?? []) as AnswerRow[],
  });

  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>({});
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = (questions ?? [])
        .filter((q) => q.questions)
        .map((q) => {
          const qq = q.questions!;
          if (qq.type === "mcq") {
            const choice = mcqAnswers[qq.id];
            return { question_id: qq.id, mcq_choice: typeof choice === "number" ? choice : null, written_text: null };
          }
          return { question_id: qq.id, mcq_choice: null, written_text: writtenAnswers[qq.id] ?? "" };
        });
      return submit({ data: { homework_id: id, answers: payload } });
    },
    onSuccess: () => {
      toast.success(t("homework.submitted"));
      qc.invalidateQueries({ queryKey: ["hw-submission", id] });
      qc.invalidateQueries({ queryKey: ["hw-answers"] });
    },
    onError: (e: unknown) => toast.error(formatSupabaseError(e)),
  });

  if (!hw) return <Section title=""><EmptyState text={t("common.loading")} /></Section>;

  const isPastDue = hw.auto_lock && hw.due_at && new Date(hw.due_at).getTime() < Date.now();
  const isClosed = hw.locked || isPastDue;

  const backLink = (
    <Link to="/student/subjects" className="text-sm text-muted-foreground">
      ← {t("common.back")}
    </Link>
  );

  return (
    <Section title={hw.title} action={backLink}>
      {hw.body && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <p className="text-sm whitespace-pre-wrap">{hw.body}</p>
            {hw.due_at && (
              <div className="text-xs text-muted-foreground mt-2">
                Due {new Date(hw.due_at).toLocaleString()}
              </div>
            )}
            <Attachments homeworkId={id} />
          </CardContent>
        </Card>
      )}
      {!hw.body && <Attachments homeworkId={id} className="mb-4 space-y-1" />}

      {hw.kind === "simple" && (
        <Card>
          <CardContent className="pt-6">
            {hw.link_url ? (
              <a
                href={hw.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                {t("homework.open_link")}
              </a>
            ) : (
              <div className="text-sm text-muted-foreground">{t("common.empty")}</div>
            )}
          </CardContent>
        </Card>
      )}

      {hw.kind === "bank" && submission && (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">{t("homework.your_score")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>{t("homework.auto_score")}: <strong>{submission.auto_score ?? 0}</strong></div>
              <div>{t("homework.manual_score")}: <strong>{submission.manual_score ?? 0}</strong></div>
              <div>
                {t("homework.final_score")}:{" "}
                {submission.final_score === null ? (
                  <Badge variant="secondary">{t("homework.pending_review")}</Badge>
                ) : (
                  <strong>{submission.final_score}</strong>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {(questions ?? []).map((q, idx) => {
              const qq = q.questions;
              if (!qq) return null;
              const ans = (answers ?? []).find((a) => a.question_id === qq.id);
              return (
                <Card key={qq.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{`Q${idx + 1}`}</Badge>
                      <span className="text-xs text-muted-foreground">{qq.points} pts</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">{qq.prompt}</p>
                    {qq.type === "mcq" ? (
                      <div className="space-y-1">
                        {(qq.choices ?? []).map((choice, i) => {
                          const picked = ans?.mcq_choice === i;
                          const isCorrect = ans?.is_correct && picked;
                          const isWrong = picked && ans?.is_correct === false;
                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${
                                isCorrect ? "border-green-500 bg-green-500/10" : isWrong ? "border-red-500 bg-red-500/10" : ""
                              }`}
                            >
                              <span className="font-mono text-xs w-5">{String.fromCharCode(65 + i)}.</span>
                              <span className="flex-1">{choice}</span>
                              {picked && (
                                <span className="text-xs">
                                  {isCorrect ? t("homework.correct") : t("homework.incorrect")}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="rounded border bg-muted/30 p-2 text-sm whitespace-pre-wrap">
                          {ans?.written_text || <span className="text-muted-foreground italic">—</span>}
                        </div>
                        <div className="text-xs">
                          {ans?.manual_score === null || ans?.manual_score === undefined ? (
                            <Badge variant="secondary">{t("homework.pending_review")}</Badge>
                          ) : (
                            <span>
                              {t("homework.manual_score")}: <strong>{ans.manual_score}</strong> / {qq.points}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {hw.kind === "bank" && !submission && isClosed && (
        <Card>
          <CardContent className="pt-6">
            <Badge variant="secondary">{t("homework.closed")}</Badge>
          </CardContent>
        </Card>
      )}

      {hw.kind === "bank" && !submission && !isClosed && (
        <div className="space-y-3">
          {(questions ?? []).length === 0 && <EmptyState text={t("homework.no_questions")} />}
          {(questions ?? []).map((q, idx) => {
            const qq = q.questions;
            if (!qq) return null;
            return (
              <Card key={qq.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{`Q${idx + 1}`}</Badge>
                    <span className="text-xs text-muted-foreground">{qq.points} pts</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{qq.prompt}</p>
                  {qq.type === "mcq" ? (
                    <RadioGroup
                      value={mcqAnswers[qq.id]?.toString() ?? ""}
                      onValueChange={(v) => setMcqAnswers({ ...mcqAnswers, [qq.id]: Number(v) })}
                    >
                      {(qq.choices ?? []).map((choice, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <RadioGroupItem value={i.toString()} id={`${qq.id}-${i}`} />
                          <Label htmlFor={`${qq.id}-${i}`} className="text-sm font-normal cursor-pointer flex-1">
                            <span className="font-mono text-xs mr-2">{String.fromCharCode(65 + i)}.</span>
                            {choice}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : (
                    <Textarea
                      rows={4}
                      placeholder={t("homework.your_answer")}
                      value={writtenAnswers[qq.id] ?? ""}
                      onChange={(e) => setWrittenAnswers({ ...writtenAnswers, [qq.id]: e.target.value })}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
          {(questions ?? []).length > 0 && (
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? t("common.loading") : t("homework.submit")}
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}
