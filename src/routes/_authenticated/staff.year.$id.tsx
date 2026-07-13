import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Section, EmptyState } from "@/components/portal/PortalShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/hooks/use-me";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/year/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { data: me } = useMe();
  const isAdmin = !!me?.roles.includes("admin");

  const { data: year } = useQuery({
    queryKey: ["year", id],
    queryFn: async () =>
      (await (supabase as any).from("academic_years").select("id,label,started_at,closed_at,is_current").eq("id", id).maybeSingle()).data,
  });
  const { data: counts } = useQuery({
    queryKey: ["year-counts", id],
    enabled: isAdmin,
    queryFn: async () => {
      const [e, g, a, ta, hw, an] = await Promise.all([
        (supabase as any).from("student_enrollments").select("id", { count: "exact", head: true }).eq("academic_year_id", id),
        (supabase as any).from("grades").select("id", { count: "exact", head: true }).eq("academic_year_id", id),
        (supabase as any).from("attendance").select("id", { count: "exact", head: true }).eq("academic_year_id", id),
        (supabase as any).from("teacher_assignments").select("id", { count: "exact", head: true }).eq("academic_year_id", id),
        (supabase as any).from("homework").select("id", { count: "exact", head: true }).eq("academic_year_id", id),
        (supabase as any).from("announcements").select("id", { count: "exact", head: true }).eq("academic_year_id", id),
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

  if (!isAdmin) return <div className="p-8">{t("common.empty")}</div>;
  if (!year) return <EmptyState text={t("common.loading")} />;

  return (
    <Section
      title={`${t("year.title")} · ${year.label}`}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/staff/year"><ChevronLeft className="w-4 h-4 mr-1" />{t("common.back")}</Link>
        </Button>
      }
    >
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm mb-4">
        {year.is_current ? t("year.current") : `${t("year.closed")} — ${t("year.viewing_past_readonly")}`}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {counts && (
          <>
            <Stat label={t("nav.subjects")} value={counts.teacher_assignments} sub={t("nav.teachers")} />
            <Stat label={t("nav.grades")} value={counts.grades} />
            <Stat label={t("nav.attendance")} value={counts.attendance} />
            <Stat label={t("nav.announcements")} value={counts.announcements} />
            <Stat label="Homework" value={counts.homework} />
            <Stat label="Enrollments" value={counts.enrollments} />
          </>
        )}
      </div>
      <div className="mt-4 text-xs text-muted-foreground">
        <Badge variant="secondary">{t("year.viewing_past_readonly")}</Badge>
      </div>
    </Section>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}{sub ? ` · ${sub}` : ""}</div>
      <div className="font-serif text-2xl mt-1">{value}</div>
    </div>
  );
}
