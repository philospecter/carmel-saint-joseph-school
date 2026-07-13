import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/student/subjects/")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const stage = me?.enrollment?.stage_group;
  const grade = me?.enrollment?.grade_level;
  const { data } = useQuery({
    queryKey: ["student-subjects", stage, grade],
    enabled: !!stage && !!grade,
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, name, stage_group, grade_level").eq("stage_group", stage!).eq("grade_level", grade!).order("name");
      return data ?? [];
    },
  });
  return (
    <Section title={t("nav.subjects")}>
      {(data ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map((subject) => (
            <Link key={subject.id} to="/student/subjects/$id" params={{ id: subject.id }} className="block h-full">
              <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="font-serif text-lg font-semibold">{subject.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t(`grade.${subject.grade_level}`)}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}