import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/student/subjects/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const { t } = useI18n();

  const { data: subject } = useQuery({
    queryKey: ["subject", id],
    queryFn: async () => (await supabase.from("subjects").select("*").eq("id", id).maybeSingle()).data,
  });
  const { data: assignments } = useQuery({
    queryKey: ["subject-assignments", id],
    queryFn: async () => (await supabase.from("teacher_assignments").select("id").eq("subject_id", id)).data ?? [],
  });
  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: announcements } = useQuery({
    queryKey: ["subject-anns", id, assignmentIds.join(",")],
    enabled: assignmentIds.length > 0,
    queryFn: async () => (await supabase.from("announcements").select("*").eq("scope", "subject").in("teacher_assignment_id", assignmentIds).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: homework } = useQuery({
    queryKey: ["subject-hw", id, assignmentIds.join(",")],
    enabled: assignmentIds.length > 0,
    queryFn: async () => (await supabase.from("homework").select("*").in("teacher_assignment_id", assignmentIds).order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <Section title={subject?.name ?? ""} action={<Link to="/student/subjects" className="text-sm text-muted-foreground">← {t("common.back")}</Link>}>
      <Tabs defaultValue="hw">
        <TabsList>
          <TabsTrigger value="hw">Homework</TabsTrigger>
          <TabsTrigger value="ann">{t("nav.announcements")}</TabsTrigger>
        </TabsList>
        <TabsContent value="hw" className="space-y-3 mt-3">
          {(homework ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : homework!.map((h) => (
            <Link key={h.id} to="/student/homework/$id" params={{ id: h.id }} className="block">
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{h.title}</CardTitle>
                    {h.locked && <Badge variant="secondary">Closed</Badge>}
                    {h.kind === "bank" && <Badge>Quiz</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  {h.body && <p className="text-sm whitespace-pre-wrap mb-2">{h.body}</p>}
                  {h.due_at && <div className="text-xs text-muted-foreground">Due {new Date(h.due_at).toLocaleString()}</div>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </TabsContent>
        <TabsContent value="ann" className="space-y-3 mt-3">
          {(announcements ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : announcements!.map((a) => (
            <Card key={a.id}>
              <CardHeader><CardTitle className="text-base">{a.title}</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{a.body}</p></CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </Section>
  );
}
