import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, GraduationCap, Users } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { formatSupabaseError } from "@/lib/errors";
import { listAcademicYears, startNewAcademicYear, pendingPromotionCount } from "@/lib/academic-years.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/staff/year")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const isAdmin = !!me?.roles.includes("admin");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listAcademicYears);
  const startFn = useServerFn(startNewAcademicYear);
  const pendingFn = useServerFn(pendingPromotionCount);
  const { data: years } = useQuery({ queryKey: ["academic-years"], queryFn: () => listFn() });
  const { data: pendingCount } = useQuery({
    queryKey: ["pending-promotion-count"],
    enabled: isAdmin,
    queryFn: () => pendingFn(),
  });


  const [open, setOpen] = useState(false);
  const current = years?.find((y) => y.is_current);
  const defaultLabel = (() => {
    if (!current) return "";
    const m = current.label.match(/^(\d{4})-(\d{4})$/);
    if (m) return `${Number(m[2])}-${Number(m[2]) + 1}`;
    return "";
  })();
  const [label, setLabel] = useState(defaultLabel);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const rollover = useMutation({
    mutationFn: async () => {
      if (!me?.email) throw new Error("Missing email");
      if (confirm.trim().toUpperCase() !== "CONFIRM") throw new Error(t("year.type_confirm_error"));
      const trimmed = label.trim();
      if (!trimmed) throw new Error(t("year.label_required"));
      // Client-side duplicate label check
      if ((years ?? []).some((y) => y.label.trim().toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(t("year.label_exists"));
      }
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: me.email, password });
      if (authErr) throw new Error(t("year.password_wrong"));
      await startFn({ data: { label: trimmed } });
    },
    onSuccess: async () => {
      toast.success(t("year.rollover_success"));
      await qc.invalidateQueries();
      setOpen(false);
      setPassword("");
      setConfirm("");
      navigate({ to: "/staff/year/promote" });
    },
    onError: (e) => {
      const msg = String((e as Error)?.message ?? "");
      const isDup = /duplicate key|already exists|23505/i.test(msg);
      toast.error(isDup ? t("year.label_exists") : formatSupabaseError(e));
    },
  });


  if (!isAdmin) return <div className="p-8">{t("common.empty")}</div>;

  return (
    <Section
      title={t("year.title")}
      action={
        <div className="flex items-center gap-2">
          {isAdmin && (pendingCount ?? 0) > 0 && (
            <Button variant="outline" asChild>
              <Link to="/staff/year/promote">
                <Users className="w-4 h-4 mr-2" />
                Promote students ({pendingCount})
              </Link>
            </Button>
          )}
          <Button onClick={() => { setLabel(defaultLabel); setOpen(true); }}>
            <GraduationCap className="w-4 h-4 mr-2" />
            {t("year.start_new")}
          </Button>
        </div>
      }
    >

      {!years || years.length === 0 ? (
        <EmptyState text={t("common.empty")} />
      ) : (
        <div className="rounded-lg border divide-y">
          {years.map((y) => (
            <div key={y.id} className="p-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-serif text-lg">{y.label}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(y.started_at).toLocaleDateString()}
                  {y.closed_at ? ` — ${new Date(y.closed_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {y.is_current ? (
                  <Badge>{t("year.current")}</Badge>
                ) : (
                  <>
                    <Badge variant="secondary">{t("year.closed")}</Badge>
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/staff/year/$id" params={{ id: y.id }}>
                        {t("year.view")}
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("year.start_new")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
              <div>{t("year.confirm_warning")}</div>
            </div>
            <div className="space-y-1">
              <Label>{t("year.new_label")}</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2026-2027" />
              {label.trim() && (years ?? []).some((y) => y.label.trim().toLowerCase() === label.trim().toLowerCase()) && (
                <div className="text-xs text-destructive">{t("year.label_exists")}</div>
              )}
            </div>
            <div className="space-y-1">
              <Label>{t("year.password_prompt")}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1">
              <Label>{t("year.type_confirm")}</Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="CONFIRM" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={rollover.isPending}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              aria-busy={rollover.isPending}
              disabled={
                rollover.isPending
                || !label.trim()
                || !password
                || confirm.trim().toUpperCase() !== "CONFIRM"
                || (years ?? []).some((y) => y.label.trim().toLowerCase() === label.trim().toLowerCase())
              }
              onClick={() => { if (!rollover.isPending) rollover.mutate(); }}
            >
              {rollover.isPending ? t("common.loading") : t("year.confirm_rollover")}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </Section>
  );
}
