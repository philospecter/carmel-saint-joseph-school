import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/teacher/")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const { data } = useQuery({
    queryKey: ["teacher-assignments", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => (await supabase.from("teacher_assignments").select("id, subjects(id, name, stage_group, grade_level)").eq("teacher_id", me!.userId)).data ?? [],
  });
  return (
    <Section title={t("nav.subjects")}>
      {(data ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map((a) => {
            const s = (a as { subjects: { id: string; name: string; grade_level: string } }).subjects;
            return (
              <Link key={a.id} to="/teacher/subject/$id" params={{ id: a.id }}>
                <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                  <CardContent className="p-6 text-center">
                    <div className="font-serif text-2xl font-semibold text-primary">{s.name}</div>
                    <div className="text-sm text-muted-foreground mt-2">{t(`grade.${s.grade_level}`)}</div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
}
