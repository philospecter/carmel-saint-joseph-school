import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { approveSignupRequest } from "@/lib/auth.functions";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/staff/requests")({ component: Page });

function Page() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["staff-requests"],
    queryFn: async () => (await supabase.from("signup_requests").select("*, profiles!signup_requests_user_id_profiles_fkey(full_name, national_id, mobile, address)").eq("status", "pending").order("created_at", { ascending: false })).data ?? [],
  });
  async function handle(id: string, approve: boolean) {
    try {
      await approveSignupRequest({ data: { requestId: id, approve } });
      toast.success(approve ? "Approved" : "Rejected");
      qc.invalidateQueries();
    } catch (e) { toast.error(formatSupabaseError(e)); }
  }
  return (
    <Section title={t("nav.requests")}>
      <div className="space-y-3">
        {(data ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : data!.map((r) => {
          const p = (r as unknown as { profiles?: { full_name: string; national_id: string; mobile: string; address: string } }).profiles;
          return (
            <Card key={r.id}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4 justify-between">
                <div>
                  <div className="font-medium">{p?.full_name}</div>
                  <div className="text-sm text-muted-foreground">ID: {p?.national_id} · {p?.mobile}</div>
                  <div className="text-xs text-muted-foreground">{t(`grade.${r.grade_level}`)} · {t(`stage.${r.stage_group}`)}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handle(r.id, true)}>{t("common.approve")}</Button>
                  <Button size="sm" variant="outline" onClick={() => handle(r.id, false)}>{t("common.reject")}</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
