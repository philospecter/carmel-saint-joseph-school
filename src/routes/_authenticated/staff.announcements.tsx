import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, STAGE_GROUPS } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { useMe } from "@/hooks/use-me";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/staff/announcements")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const isAdmin = !!me?.roles.includes("admin");
  const availableStages = isAdmin ? [...STAGE_GROUPS] : (me?.stages ?? []);
  const [stage, setStage] = useState<string>(availableStages[0] ?? "primary_1_2");
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const { data } = useQuery({
    queryKey: ["staff-anns"],
    queryFn: async () => (await supabase.from("announcements").select("*").eq("scope", "stage").order("created_at", { ascending: false })).data ?? [],
  });
  async function post() {
    if (!title || !body || !me) return;
    const { error } = await supabase.from("announcements").insert({ author_id: me.userId, scope: "stage", stage_group: stage as never, title, body });
    if (error) return toast.error(formatSupabaseError(error));
    setTitle(""); setBody("");
    qc.invalidateQueries({ queryKey: ["staff-anns"] });
    toast.success("Posted");
  }
  async function del(id: string) {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return toast.error(formatSupabaseError(error));
    qc.invalidateQueries({ queryKey: ["staff-anns"] });
  }
  return (
    <Section title={t("nav.announcements")}>
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">New</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>{t("auth.stage")}</Label>
              <Select value={stage} onValueChange={setStage}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{availableStages.map((s) => <SelectItem key={s} value={s}>{t(`stage.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t("common.title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          </div>
          <div><Label>{t("common.body")}</Label><Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <Button onClick={post}>{t("common.create")}</Button>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {(data ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : data!.map((a) => (
          <Card key={a.id}>
            <CardHeader className="flex-row justify-between items-center pb-2">
              <CardTitle className="text-base">{a.title}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => del(a.id)}>×</Button>
            </CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{a.body}</p><div className="text-xs text-muted-foreground mt-1">{a.stage_group && t(`stage.${a.stage_group}`)}</div></CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
