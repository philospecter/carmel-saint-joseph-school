import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, STAGE_GROUPS } from "@/lib/i18n";
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
import { createStaffAccount } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/staff/managers")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  if (!me?.roles.includes("admin")) return <div className="p-8">Admin only.</div>;

  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "stage_manager");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const [{ data: profs }, { data: stages }] = await Promise.all([
        supabase.from("profiles").select("*").in("id", ids),
        supabase.from("stage_manager_assignments").select("*").in("user_id", ids),
      ]);
      return (profs ?? []).map((p) => ({ ...p, stages: (stages ?? []).filter((s) => s.user_id === p.id).map((s) => s.stage_group) }));
    },
  });

  return (
    <Section title={t("nav.stage_managers")} action={<CreateSMDialog onDone={() => qc.invalidateQueries({ queryKey: ["managers"] })} />}>
      <div className="space-y-3">
        {(managers ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : managers!.map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <div>
                <CardTitle className="text-base">{m.full_name}</CardTitle>
                <div className="text-xs text-muted-foreground">{m.email} · {m.mobile}</div>
                <div className="text-xs mt-1">{m.stages.map((s: string) => t(`stage.${s}`)).join(", ")}</div>
              </div>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </Section>
  );
}

function CreateSMDialog({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", mobile: "", address: "", password: "", stage_group: "primary_1_2" as (typeof STAGE_GROUPS)[number] });
  async function submit() {
    try {
      await createStaffAccount({ data: { kind: "stage_manager", ...form } });
      toast.success("Stage manager created");
      setForm({ full_name: "", email: "", mobile: "", address: "", password: "", stage_group: "primary_1_2" });
      setOpen(false); onDone();
    } catch (e) { toast.error(formatSupabaseError(e)); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>+ Stage Manager</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New stage manager</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("auth.full_name")}</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>{t("auth.mobile")}</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><Label>{t("auth.address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>{t("auth.password")}</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div><Label>{t("auth.stage")}</Label>
            <Select value={form.stage_group} onValueChange={(v) => setForm({ ...form, stage_group: v as (typeof STAGE_GROUPS)[number] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STAGE_GROUPS.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={submit}>{t("common.create")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
