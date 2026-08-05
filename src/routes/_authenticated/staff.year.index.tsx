import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, GraduationCap, Pencil, Trash2 } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { formatSupabaseError } from "@/lib/errors";
import {
  listAcademicYears,
  deleteAcademicYear,
  renameAcademicYear,
  type AcademicYear,
} from "@/lib/academic-years.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/staff/year/")({ component: Page });

function fmt(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const isAdmin = !!me?.roles.includes("admin");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listAcademicYears);
  const { data: years } = useQuery({ queryKey: ["academic-years"], queryFn: () => listFn() });

  const [startOpen, setStartOpen] = useState(false);
  const current = years?.find((y) => y.is_current);
  const defaultLabel = (() => {
    if (!current) return "";
    const m = current.label.match(/^(\d{4})-(\d{4})$/);
    if (m) return `${Number(m[2])}-${Number(m[2]) + 1}`;
    return "";
  })();
  const [label, setLabel] = useState(defaultLabel);
  const [confirm, setConfirm] = useState("");

  function beginRollover() {
    const trimmed = label.trim();
    if (!trimmed) return toast.error(t("year.label_required"));
    if ((years ?? []).some((y) => y.label.trim().toLowerCase() === trimmed.toLowerCase())) {
      return toast.error(t("year.label_exists"));
    }
    if (confirm.trim().toUpperCase() !== "CONFIRM") return toast.error(t("year.type_confirm_error"));
    setStartOpen(false);
    setConfirm("");
    navigate({ to: "/staff/year/promote", search: { label: trimmed } });
  }

  if (!isAdmin) return <div className="p-8">{t("common.empty")}</div>;

  return (
    <Section
      title={t("year.title")}
      action={
        <Button onClick={() => { setLabel(defaultLabel); setConfirm(""); setStartOpen(true); }}>
          <GraduationCap className="w-4 h-4 mr-2" />
          {t("year.start_new")}
        </Button>
      }
    >
      {!years || years.length === 0 ? (
        <EmptyState text={t("common.empty")} />
      ) : (
        <div className="rounded-lg border divide-y">
          {years.map((y) => (
            <YearRow key={y.id} year={y} allYears={years} qc={qc} />
          ))}
        </div>
      )}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("year.start_new")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
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
              <Label>{t("year.type_confirm")}</Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="CONFIRM" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={
                !label.trim()
                || confirm.trim().toUpperCase() !== "CONFIRM"
                || (years ?? []).some((y) => y.label.trim().toLowerCase() === label.trim().toLowerCase())
              }
              onClick={beginRollover}
            >
              {t("year.confirm_rollover")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function YearRow({ year, allYears, qc }: { year: AcademicYear; allYears: AcademicYear[]; qc: ReturnType<typeof useQueryClient> }) {
  const { t } = useI18n();
  const { data: me } = useMe();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newLabel, setNewLabel] = useState(year.label);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const renameFn = useServerFn(renameAcademicYear);
  const deleteFn = useServerFn(deleteAcademicYear);

  const counts = useQuery({
    queryKey: ["year-counts", year.id],
    enabled: deleteOpen,
    queryFn: async () => {
      const [e, g, a, ta, hw, an] = await Promise.all([
        (supabase as any).from("student_enrollments").select("id", { count: "exact", head: true }).eq("academic_year_id", year.id),
        (supabase as any).from("grades").select("id", { count: "exact", head: true }).eq("academic_year_id", year.id),
        (supabase as any).from("attendance").select("id", { count: "exact", head: true }).eq("academic_year_id", year.id),
        (supabase as any).from("teacher_assignments").select("id", { count: "exact", head: true }).eq("academic_year_id", year.id),
        (supabase as any).from("homework").select("id", { count: "exact", head: true }).eq("academic_year_id", year.id),
        (supabase as any).from("announcements").select("id", { count: "exact", head: true }).eq("academic_year_id", year.id),
      ]);
      return {
        enrollments: e.count ?? 0,
        grades: g.count ?? 0,
        attendance: a.count ?? 0,
        teacher_assignments: ta.count ?? 0,
        homework: hw.count ?? 0,
        announcements: an.count ?? 0,
      };
    },
  });

  const renameM = useMutation({
    mutationFn: async () => {
      const trimmed = newLabel.trim();
      if (!trimmed) throw new Error(t("year.label_required"));
      if (allYears.some((y) => y.id !== year.id && y.label.trim().toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(t("year.label_exists"));
      }
      await renameFn({ data: { year_id: year.id, label: trimmed } });
    },
    onSuccess: () => {
      toast.success(t("year.rename_success"));
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["academic-years"] });
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  const deleteM = useMutation({
    mutationFn: async () => {
      if (!me?.email) throw new Error("Missing email");
      if (confirmText.trim().toUpperCase() !== "CONFIRM") throw new Error(t("year.type_confirm_error"));
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: me.email, password });
      if (authErr) throw new Error(t("year.password_wrong"));
      await deleteFn({ data: { year_id: year.id } });
    },
    onSuccess: () => {
      toast.success(t("year.delete_success"));
      setDeleteOpen(false);
      setPassword("");
      setConfirmText("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  });

  return (
    <div className="p-3 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <div className="font-serif text-lg">{year.label}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(year.started_at).toLocaleDateString()}
          {year.closed_at ? ` — ${new Date(year.closed_at).toLocaleDateString()}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {year.is_current ? <Badge>{t("year.current")}</Badge> : <Badge variant="secondary">{t("year.closed")}</Badge>}

        {!year.is_current && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/staff/year/$id" params={{ id: year.id }}>{t("year.view")}</Link>
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={() => { setNewLabel(year.label); setEditOpen(true); }}>
          <Pencil className="h-3.5 w-3.5 mr-1" />
          {t("year.edit_label")}
        </Button>

        {year.is_current ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" variant="outline" disabled>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {t("year.delete")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("year.delete_disabled_current")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setPassword(""); setConfirmText(""); setDeleteOpen(true); }}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {t("year.delete")}
          </Button>
        )}
      </div>

      {/* Rename */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("year.edit_label")}</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>{t("year.new_label")}</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => renameM.mutate()} disabled={renameM.isPending || !newLabel.trim() || newLabel.trim() === year.label}>
              {renameM.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("year.delete_title")} — {year.label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
              <div>{t("year.delete_warning")}</div>
            </div>
            {counts.data && (
              <p className="text-sm text-muted-foreground">{fmt(t("year.delete_counts"), counts.data)}</p>
            )}
            <div className="space-y-1">
              <Label>{t("year.password_prompt")}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1">
              <Label>{t("year.type_confirm")}</Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRM" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteM.isPending}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteM.mutate()}
              disabled={deleteM.isPending || !password || confirmText.trim().toUpperCase() !== "CONFIRM"}
            >
              {deleteM.isPending ? t("common.loading") : t("year.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
