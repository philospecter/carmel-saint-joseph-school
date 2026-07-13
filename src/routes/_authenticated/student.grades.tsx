import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { listTermMonths } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/student/grades")({ component: Page });

const MONTH_LABEL = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Term = "term_1" | "term_2" | "midyear" | "final";
const TERMS: Term[] = ["term_1", "term_2", "midyear", "final"];

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const [term, setTerm] = useState<Term>("term_1");

  const termMonthsFn = useServerFn(listTermMonths);
  const { data: termMonths } = useQuery({
    queryKey: ["term-months"],
    queryFn: () => termMonthsFn(),
  });

  const { data } = useQuery({
    queryKey: ["student-grades", me?.userId, term],
    enabled: !!me?.userId,
    queryFn: async () =>
      (await (supabase as any)
        .from("grades")
        .select("subject_id, term, month, score, max_score, subjects(name)")
        .eq("student_id", me!.userId)
        .eq("term", term)).data ?? [],
  });

  const isMonthly = term === "term_1" || term === "term_2";
  const months = isMonthly
    ? (term === "term_1" ? termMonths?.term_1 ?? [10, 11] : termMonths?.term_2 ?? [2, 3])
    : [];

  // Group by subject; store per-bucket max_score alongside the score so historical
  // grades keep the denominator they were entered under.
  const bySubject = new Map<string, { name: string; scores: Record<string, { score: number; max: number }> }>();
  for (const g of (data ?? []) as any[]) {
    const subj = g.subjects as { name: string } | undefined;
    const name = subj?.name ?? "—";
    const key = g.subject_id as string;
    const entry = bySubject.get(key) ?? { name, scores: {} };
    const bucket = isMonthly ? String(g.month) : "single";
    entry.scores[bucket] = { score: Number(g.score), max: Number(g.max_score) };
    bySubject.set(key, entry);
  }

  function displayScore(cell: { score: number; max: number } | undefined): string {
    if (!cell) return "—";
    return `${cell.score}/${cell.max}`;
  }
  function isFail(cell: { score: number; max: number } | undefined): boolean {
    return !!cell && cell.score < cell.max / 2;
  }





  return (
    <Section
      title={t("nav.grades")}
      action={
        <Select value={term} onValueChange={(v) => setTerm(v as Term)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{TERMS.map((tm) => <SelectItem key={tm} value={tm}>{t(`term.${tm}`)}</SelectItem>)}</SelectContent>
        </Select>
      }
    >
      {bySubject.size === 0 ? (
        <EmptyState text={t("common.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-start p-3 font-medium">{t("nav.subjects")}</th>
                {isMonthly
                  ? months.map((m) => <th key={m} className="p-3 font-medium">{MONTH_LABEL[m]}</th>)
                  : <th className="p-3 font-medium">{t(`term.${term}`)}</th>}
              </tr>
            </thead>
            <tbody>
              {Array.from(bySubject.values()).map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{row.name}</td>
                  {isMonthly
                    ? months.map((m) => {
                        const cell = row.scores[String(m)];
                        return (
                          <td key={m} className={`p-3 text-center font-serif ${isFail(cell) ? "text-destructive font-semibold" : ""}`}>
                            {cell
                              ? <>{displayScore(cell)}{isFail(cell) && <div className="text-xs font-sans font-normal">{t("grades.failed")}</div>}</>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })
                    : (() => {
                        const cell = row.scores["single"];
                        return (
                          <td className={`p-3 text-center font-serif ${isFail(cell) ? "text-destructive font-semibold" : ""}`}>
                            {cell
                              ? <>{displayScore(cell)}{isFail(cell) && <div className="text-xs font-sans font-normal">{t("grades.failed")}</div>}</>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })()}

                </tr>
              ))}

            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
