import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Search } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { previewCurrentYearRoster, startYearAndPromote } from "@/lib/academic-years.functions";
import { useI18n } from "@/lib/i18n";
import { formatSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/staff/year/promote")({
  validateSearch: (search: Record<string, unknown>): { label: string } => ({
    label: typeof search.label === "string" ? search.label : "",
  }),
  component: Page,
});


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
  const qc = useQueryClient();
  const { label } = Route.useSearch();

  const previewFn = useServerFn(previewCurrentYearRoster);
  const startFn = useServerFn(startYearAndPromote);
  const { data: roster } = useQuery({ queryKey: ["promotion-preview-current"], queryFn: () => previewFn() });

  const [repeats, setRepeats] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");

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
    mutationFn: async () => {
      if (!label.trim()) throw new Error(t("year.label_required"));
      if (!me?.email) throw new Error("Missing email");
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: me.email, password });
      if (authErr) throw new Error(t("year.password_wrong"));
      await startFn({
        data: { label, promotions, repeats: Array.from(repeats) },
      });
    },
    onSuccess: async () => {
      toast.success(t("year.rollover_success"));
      setConfirmOpen(false);
      await qc.invalidateQueries();
      navigate({ to: "/staff/year" });
    },
    onError: (e) => {
      const msg = String((e as Error)?.message ?? "");
      const isDup = /already exists|duplicate/i.test(msg);
      toast.error(isDup ? t("year.label_exists") : formatSupabaseError(e));
    },
  });

  const availableStages = useMemo(() => {
    if (!roster) return [] as string[];
    return Array.from(new Set(roster.map((r) => r.stage_group)));
  }, [roster]);
  const availableGrades = useMemo(() => {
    if (!roster) return [] as string[];
    return Array.from(
      new Set(
        roster
          .filter((r) => stageFilter === "all" || r.stage_group === stageFilter)
          .map((r) => r.grade_level),
      ),
    );
  }, [roster, stageFilter]);

  const filteredRoster = useMemo(() => {
    if (!roster) return [];
    const q = search.trim().toLowerCase();
    return roster
      .filter((g) => stageFilter === "all" || g.stage_group === stageFilter)
      .filter((g) => gradeFilter === "all" || g.grade_level === gradeFilter)
      .map((g) => ({
        ...g,
        students: q ? g.students.filter((s) => s.full_name.toLowerCase().includes(q)) : g.students,
      }))
      .filter((g) => g.students.length > 0);
  }, [roster, search, stageFilter, gradeFilter]);

  if (!isAdmin) return <div className="p-8">{t("common.empty")}</div>;
  if (!label.trim()) {
    return (
      <Section title={t("year.promote_title")}>
        <EmptyState text={t("year.label_required")} />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate({ to: "/staff/year" })}>{t("common.back")}</Button>
        </div>
      </Section>
    );
  }
  if (!roster) return null;

  return (
    <Section
      title={t("year.promote_title")}
      action={
        <Button onClick={() => { setPassword(""); setConfirmOpen(true); }}>{t("year.confirm_and_start")}</Button>
      }
    >
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm mb-4 flex gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <div><strong>{t("year.pending_label")}:</strong> {label}</div>
          <div className="mt-1">{t("year.promote_review_intro")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("year.abandon_note")}</div>
        </div>
      </div>

      {roster.length === 0 ? (
        <EmptyState text={t("year.no_students_to_promote")} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search") ?? "Search"}
                className="pl-8"
              />
            </div>
            <Select
              value={stageFilter}
              onValueChange={(v) => { setStageFilter(v); setGradeFilter("all"); }}
            >
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all") ?? "All stages"}</SelectItem>
                {availableStages.map((s) => (
                  <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all") ?? "All grades"}</SelectItem>
                {availableGrades.map((g) => (
                  <SelectItem key={g} value={g}>{t(`grade.${g}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredRoster.length === 0 ? (
            <EmptyState text={t("common.empty")} />
          ) : (
            <div className="space-y-6">
              {filteredRoster.map((group) => {
                const isGrad = NEXT[group.grade_level] === "graduate";
                const next = NEXT[group.grade_level];
                return (
                  <div key={`${group.stage_group}|${group.grade_level}`} className="rounded-lg border">
                    <div className="p-3 border-b flex items-center justify-between gap-2 flex-wrap">
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
                      <div className="text-xs text-muted-foreground">{group.students.length} {t("year.students")}</div>
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
          )}
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("year.confirm_and_start")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <div><strong>{t("year.pending_label")}:</strong> {label}</div>
                <div className="text-xs mt-1">{repeats.size} {t("year.repeat")}</div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("year.password_prompt")}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submit.isPending}>{t("common.cancel")}</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || !password}>
              {submit.isPending ? t("common.loading") : t("year.confirm_and_start")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
