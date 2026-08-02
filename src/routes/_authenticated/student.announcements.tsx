import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Attachments } from "@/components/files/Attachments";

export const Route = createFileRoute("/_authenticated/student/announcements")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const stage = me?.enrollment?.stage_group;
  const { data } = useQuery({
    queryKey: ["student-announcements", stage],
    enabled: !!stage,
    queryFn: async () => {
      const { data } = await supabase.from("announcements").select("*").eq("scope", "stage").eq("stage_group", stage!).order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  return (
    <Section title={t("nav.announcements")}>
      <div className="space-y-3">
        {(data ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> :
          data!.map((a) => (
            <Card key={a.id}>
              <CardHeader><CardTitle className="text-base">{a.title}</CardTitle></CardHeader>
              <CardContent><p className="whitespace-pre-wrap text-sm">{a.body}</p><Attachments announcementId={a.id} /><div className="mt-2 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</div></CardContent>
            </Card>
          ))
        }
      </div>
    </Section>
  );
}
