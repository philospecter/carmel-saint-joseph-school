import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useI18n } from "@/lib/i18n";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { useCurrentYearId } from "@/lib/rosters";

export const Route = createFileRoute("/_authenticated/student/attendance")({ component: Page });

function Page() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const { data: currentYearId } = useCurrentYearId();
  const { data } = useQuery({
    queryKey: ["student-att", me?.userId, currentYearId],
    enabled: !!me?.userId && !!currentYearId,
    queryFn: async () => (await supabase.from("attendance").select("*").eq("student_id", me!.userId).eq("academic_year_id", currentYearId!).order("date", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <Section title={t("nav.attendance")}>
      {(data ?? []).length === 0 ? <EmptyState text={t("common.empty")} /> : (
        <div className="rounded-lg border divide-y">
          {data!.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm">
              <span>{r.date}</span>
              <Badge variant={r.status === "present" ? "default" : r.status === "late" ? "secondary" : "destructive"}>{t(`attendance.${r.status}`)}</Badge>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
