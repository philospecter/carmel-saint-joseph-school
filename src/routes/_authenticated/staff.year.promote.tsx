import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/hooks/use-me";
import { previewPromotion, promoteStudents } from "@/lib/academic-years.functions";
import { useI18n } from "@/lib/i18n";
import { formatSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/staff/year/promote")({ component: Page });

// Linear grade progression map, matching the DB fallback in promote_students().
const NEXT: Record<string, { stage: string; grade: string } | "graduate"> = {
  p1: { stage: "primary_1_2", grade: "p2" },
  p2: { stage: "primary_3_6", grade: "p3" },
  p3: { stage: "primary_3_6", grade: "p4" },
  p4: { stage: "primary_3_6", grade: "p5" },
  p5: { stage: "primary_3_6", grade: "p6" },
  p6: { stage: "preparatory", grade: "prep1" },
  prep1: { stage: "preparatory", grade: "prep2" },
  prep2: { stage: "preparatory", grade: "prep3" },
  prep3: { stage: "secondary", grade: "sec1" },
  sec1: { stage: "secondary", grade: "sec2" },
  sec2: { stage: "secondary", grade: "sec3" },
  sec3: "graduate",
};

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const isAdmin = !!me?.roles.includes("admin");
  const navigate = useNavigate();
  const previewFn = useServerFn(previewPromotion);
  const promoteFn = useServerFn(promoteStudents);
  const { data: roster } = useQuery({ queryKey: ["promotion-preview"], queryFn: () => previewFn() });

  const [repeats, setRepeats] = useState<Set<string>>(new Set());

  const promotions = useMemo(() => {
    if (!roster) return [];
    return roster
      .filter((r) => NEXT[r.grade_level] && NEXT[r.grade_level] !== "graduate")
      .map((r) => {
        const n = NEXT[r.grade_level] as { stage: string; grade: string };
        return { from_stage: r.stage_group, from_grade: r.grade_level, to_stage: n.stage, to_grade: n.grade };
      });
  }, [roster]);

  const submit = useMutation({
    mutationFn: () => promoteFn({ data: { promotions, repeats: Array.from(repeats) } }),
    onSuccess: () => {
      toast.success(t("year.promote_success"));
      navigate({ to: "/staff" });
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  if (!isAdmin) return <div className="p-8">{t("common.empty")}</div>;
  if (!roster) return null;
  if (roster.length === 0) return <EmptyState text={t("year.no_students_to_promote")} />;

  return (
    <Section
      title={t("year.promote_title")}
      action={
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? t("common.loading") : t("year.promote_confirm")}
        </Button>
      }
    >
      <div className="space-y-6">
        {roster.map((group) => {
          const isGrad = NEXT[group.grade_level] === "graduate";
          const next = NEXT[group.grade_level];
          return (
            <div key={`${group.stage_group}|${group.grade_level}`} className="rounded-lg border">
              <div className="p-3 border-b flex items-center justify-between gap-2">
                <div className="font-serif text-lg">
                  {isGrad ? (
                    <>
                      {t(`grade.${group.grade_level}`)} <span className="text-muted-foreground">→</span>{" "}
                      <Badge variant="secondary">{t("year.will_graduate")}</Badge>
                    </>
                  ) : typeof next === "object" ? (
                    <>
                      {t(`grade.${group.grade_level}`)} <span className="text-muted-foreground">→</span>{" "}
                      {t(`grade.${next.grade}`)}
                    </>
                  ) : (
                    t(`grade.${group.grade_level}`)
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {group.students.length} {t("year.students")}
                </div>
              </div>
              <div className="divide-y">
                {group.students.map((s) => (
                  <div key={s.user_id} className="p-3 flex items-center justify-between">
                    <div>{s.full_name}</div>
                    {isGrad ? (
                      <Badge variant="secondary">{t("year.will_graduate")}</Badge>
                    ) : (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={repeats.has(s.user_id)}
                          onCheckedChange={(v) => {
                            setRepeats((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(s.user_id);
                              else next.delete(s.user_id);
                              return next;
                            });
                          }}
                        />
                        {t("year.repeat")}
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
